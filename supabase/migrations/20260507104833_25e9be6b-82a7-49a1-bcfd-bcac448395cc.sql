
CREATE TABLE public.programme_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  outcome_type text NOT NULL CHECK (outcome_type IN ('engaged','contracted','delivered','disappointed','declined')),
  notes text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_programme_outcomes_programme ON public.programme_outcomes(programme_id, recorded_at DESC);
CREATE INDEX idx_programme_outcomes_actor ON public.programme_outcomes(actor_id, recorded_at DESC);
CREATE INDEX idx_programme_outcomes_type ON public.programme_outcomes(outcome_type);

ALTER TABLE public.programme_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Programme members read outcomes"
  ON public.programme_outcomes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.programme_members pm
    WHERE pm.programme_id = programme_outcomes.programme_id
      AND pm.user_id = auth.uid()
  ));

CREATE POLICY "Admins read all outcomes"
  ON public.programme_outcomes FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Extend audit trigger function to resolve outcomes
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb;
  v_key text;
  v_actor_id uuid;
  v_programme_id uuid;
  v_target_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_changes := jsonb_build_object('new', v_new);
    v_target_id := (v_new->>'id')::uuid;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_changes := jsonb_build_object('old', v_old);
    v_target_id := (v_old->>'id')::uuid;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changes := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_old) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key)
        );
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;
    v_target_id := (v_new->>'id')::uuid;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'actors' THEN
      v_actor_id := v_target_id;
    ELSIF TG_TABLE_NAME IN ('actor_certifications','actor_standards','actor_customer_history',
                            'actor_contacts','actor_descriptions','actor_capacity_attributes') THEN
      v_actor_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id', NULL)::uuid;
    ELSIF TG_TABLE_NAME = 'programmes' THEN
      v_programme_id := v_target_id;
    ELSIF TG_TABLE_NAME = 'programme_members' THEN
      v_programme_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'programme_id', NULL)::uuid;
    ELSIF TG_TABLE_NAME = 'verification_events' THEN
      v_actor_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id', NULL)::uuid;
      v_programme_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'programme_id', NULL)::uuid;
    ELSIF TG_TABLE_NAME = 'programme_outcomes' THEN
      v_actor_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id', NULL)::uuid;
      v_programme_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'programme_id', NULL)::uuid;
    END IF;
  END IF;

  PERFORM public.fn_audit_log_event(
    'mutation',
    TG_TABLE_NAME,
    v_target_id,
    v_actor_id,
    v_programme_id,
    v_changes,
    NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER programme_outcomes_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.programme_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE OR REPLACE FUNCTION public.fn_record_outcome(
  p_programme_id uuid,
  p_actor_id uuid,
  p_outcome_type text,
  p_notes text DEFAULT NULL,
  p_evidence jsonb DEFAULT '[]'::jsonb,
  p_completed_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_outcome_id uuid;
  v_caller_can_record boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.programme_members pm
    WHERE pm.programme_id = p_programme_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','consultant')
  ) OR public.is_admin(auth.uid()) INTO v_caller_can_record;

  IF NOT v_caller_can_record THEN
    RAISE EXCEPTION 'outcome_record_permission_denied'
      USING HINT = 'Caller is not a programme owner/consultant or admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.actors WHERE id = p_actor_id) THEN
    RAISE EXCEPTION 'actor_not_found' USING HINT = 'Invalid actor id.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.programmes WHERE id = p_programme_id) THEN
    RAISE EXCEPTION 'programme_not_found' USING HINT = 'Invalid programme id.';
  END IF;

  INSERT INTO public.programme_outcomes (
    programme_id, actor_id, outcome_type, notes, evidence, recorded_by, completed_at
  ) VALUES (
    p_programme_id, p_actor_id, p_outcome_type, p_notes,
    COALESCE(p_evidence, '[]'::jsonb), auth.uid(), p_completed_at
  ) RETURNING id INTO v_outcome_id;

  PERFORM public.fn_audit_log_event(
    'record_outcome',
    'programme_outcomes',
    v_outcome_id,
    p_actor_id,
    p_programme_id,
    jsonb_build_object('outcome_type', p_outcome_type, 'completed_at', p_completed_at),
    p_notes
  );

  RETURN v_outcome_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_record_outcome(uuid, uuid, text, text, jsonb, timestamptz) TO authenticated;
