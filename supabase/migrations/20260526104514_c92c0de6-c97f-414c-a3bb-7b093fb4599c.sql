-- Profile-7: fn_merge_actors RPC + archive columns + status flag

-- 1) Schema: add archive columns and extend status check
ALTER TABLE public.actors
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.actors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_actors_merged_into_id
  ON public.actors(merged_into_id) WHERE merged_into_id IS NOT NULL;

ALTER TABLE public.actors DROP CONSTRAINT IF EXISTS actors_verification_status_check;
ALTER TABLE public.actors ADD CONSTRAINT actors_verification_status_check
  CHECK (verification_status = ANY (ARRAY[
    'unverified'::text,
    'verified'::text,
    'admin_verified'::text,
    'merged_into_other'::text
  ]));

-- 2) RPC
CREATE OR REPLACE FUNCTION public.fn_merge_actors(
  p_survivor_id uuid,
  p_source_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_survivor jsonb;
  v_source jsonb;
BEGIN
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_survivor_id = p_source_id THEN
    RAISE EXCEPTION 'survivor and source must differ';
  END IF;

  SELECT to_jsonb(a) INTO v_survivor FROM public.actors a WHERE a.id = p_survivor_id;
  SELECT to_jsonb(a) INTO v_source FROM public.actors a WHERE a.id = p_source_id;
  IF v_survivor IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'actor not found';
  END IF;

  -- actor_ontology_tags: dedup on (actor_id, ontology_entry_id) via NOT EXISTS
  UPDATE public.actor_ontology_tags t
     SET actor_id = p_survivor_id
   WHERE t.actor_id = p_source_id
     AND NOT EXISTS (
       SELECT 1 FROM public.actor_ontology_tags s
        WHERE s.actor_id = p_survivor_id
          AND s.ontology_entry_id = t.ontology_entry_id
     );
  DELETE FROM public.actor_ontology_tags WHERE actor_id = p_source_id;

  -- Satellite tables (no unique constraint beyond pkey — simple UPDATE)
  UPDATE public.actor_media               SET actor_id = p_survivor_id WHERE actor_id = p_source_id;
  UPDATE public.actor_capacity_attributes SET actor_id = p_survivor_id WHERE actor_id = p_source_id;
  UPDATE public.actor_descriptions        SET actor_id = p_survivor_id WHERE actor_id = p_source_id;
  UPDATE public.actor_contacts            SET actor_id = p_survivor_id WHERE actor_id = p_source_id;
  UPDATE public.actor_certifications      SET actor_id = p_survivor_id WHERE actor_id = p_source_id;
  UPDATE public.actor_standards           SET actor_id = p_survivor_id WHERE actor_id = p_source_id;
  UPDATE public.actor_customer_history    SET actor_id = p_survivor_id WHERE actor_id = p_source_id;

  -- Cross references
  UPDATE public.session_actors           SET actor_id = p_survivor_id        WHERE actor_id = p_source_id;
  UPDATE public.user_personal_actors     SET merged_actor_id = p_survivor_id WHERE merged_actor_id = p_source_id;
  UPDATE public.actor_validation_queue   SET linked_actor_id = p_survivor_id WHERE linked_actor_id = p_source_id;
  UPDATE public.verification_events      SET actor_id = p_survivor_id        WHERE actor_id = p_source_id;

  -- Audit log re-point
  UPDATE public.audit_log
     SET target_record_id = p_survivor_id
   WHERE target_table = 'actors' AND target_record_id = p_source_id;
  UPDATE public.audit_log SET actor_id = p_survivor_id WHERE actor_id = p_source_id;

  -- Archive source
  UPDATE public.actors
     SET verification_status = 'merged_into_other',
         merged_into_id = p_survivor_id,
         merged_at = now()
   WHERE id = p_source_id;

  -- Touch survivor verifier lifecycle
  UPDATE public.actors
     SET verifier_id = v_uid,
         verified_at = now()
   WHERE id = p_survivor_id;

  -- Audit event
  PERFORM public.fn_audit_log_event(
    p_event_type := 'actor_merged',
    p_target_table := 'actors',
    p_target_record_id := p_survivor_id,
    p_actor_id := p_survivor_id,
    p_programme_id := NULL,
    p_changes := jsonb_build_object('survivor', v_survivor, 'source', v_source, 'merger', v_uid),
    p_reason := p_reason
  );

  RETURN p_survivor_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_merge_actors(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_merge_actors(uuid, uuid, text) TO authenticated;