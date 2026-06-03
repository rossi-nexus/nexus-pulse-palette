
-- 1) saved_searches table
CREATE TABLE public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  programme_id uuid REFERENCES public.programmes(id) ON DELETE SET NULL,
  name text NOT NULL,
  need_payload jsonb NOT NULL,
  axis_weights jsonb,
  threshold numeric NOT NULL DEFAULT 0.70,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_user_id ON public.saved_searches(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own saved_searches"
  ON public.saved_searches
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage all saved_searches"
  ON public.saved_searches
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER update_saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Hit checker — runs ranking against a newly verified actor.
CREATE OR REPLACE FUNCTION public.fn_check_saved_search_hits(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  v_entry_ids uuid[];
  v_constraints jsonb;
  v_score numeric;
  v_breakdown jsonb;
BEGIN
  FOR rec IN
    SELECT id, user_id, name, need_payload, axis_weights, threshold
    FROM public.saved_searches
  LOOP
    -- Collect ontology entry ids from all roles in the need payload.
    SELECT COALESCE(
      array_agg(DISTINCT (sel->>'ontology_entry_id')::uuid)
        FILTER (WHERE sel ? 'ontology_entry_id'),
      ARRAY[]::uuid[]
    )
    INTO v_entry_ids
    FROM jsonb_array_elements(COALESCE(rec.need_payload->'roles', '[]'::jsonb)) AS r
    CROSS JOIN LATERAL jsonb_each(COALESCE(r->'targets', '{}'::jsonb)) AS tgt
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tgt.value, '[]'::jsonb)) AS sel;

    IF v_entry_ids IS NULL OR array_length(v_entry_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_constraints := jsonb_build_object('ontology_entry_ids', to_jsonb(v_entry_ids))
                     || COALESCE(rec.need_payload->'constraints', '{}'::jsonb);

    SELECT total_score, breakdown
    INTO v_score, v_breakdown
    FROM public.fn_compute_actor_relevance_score_v2(
      ARRAY[p_actor_id],
      v_constraints,
      rec.axis_weights
    )
    LIMIT 1;

    IF v_score IS NOT NULL AND v_score >= rec.threshold THEN
      INSERT INTO public.audit_log (
        event_type, target_table, target_record_id, actor_id, actor_user_id, changes, reason
      ) VALUES (
        'saved_search_hit',
        'saved_searches',
        rec.id,
        p_actor_id,
        rec.user_id,
        jsonb_build_object(
          'saved_search_id', rec.id,
          'saved_search_name', rec.name,
          'actor_id', p_actor_id,
          'total_score', v_score,
          'threshold', rec.threshold,
          'breakdown', v_breakdown
        ),
        format('Saved search "%s" matched at %s (threshold %s)', rec.name, v_score, rec.threshold)
      );

      UPDATE public.saved_searches
      SET last_notified_at = now()
      WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_check_saved_search_hits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_check_saved_search_hits(uuid) TO authenticated, service_role;

-- 3) Trigger — fire when verification flips to 'verified'.
CREATE OR REPLACE FUNCTION public.fn_after_actor_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verification_status = 'verified'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.verification_status, '') <> 'verified') THEN
    PERFORM public.fn_check_saved_search_hits(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_after_actor_verified ON public.actors;
CREATE TRIGGER trg_after_actor_verified
  AFTER INSERT OR UPDATE OF verification_status ON public.actors
  FOR EACH ROW EXECUTE FUNCTION public.fn_after_actor_verified();
