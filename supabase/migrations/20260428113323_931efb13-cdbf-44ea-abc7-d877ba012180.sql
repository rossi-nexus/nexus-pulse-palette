CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
    v_target_id := (NEW).id;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_changes := jsonb_build_object('old', v_old);
    v_target_id := (OLD).id;
  ELSE  -- UPDATE
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
    v_target_id := (NEW).id;
  END IF;

  -- Resolve FK columns ONLY for non-DELETE operations.
  -- On DELETE, the parent row is being removed in the same statement; setting
  -- audit_log.actor_id/programme_id would violate FK constraints. The deleted
  -- record's identity is still preserved in target_record_id (no FK) and in
  -- changes->'old'. Added in prompt 49c to fix regression found by 49b.
  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'actors' THEN
      v_actor_id := v_target_id;
    ELSIF TG_TABLE_NAME IN ('actor_certifications', 'actor_standards', 'actor_customer_history',
                            'actor_contacts', 'actor_descriptions', 'actor_capacity_attributes') THEN
      v_actor_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id', NULL)::uuid;
    ELSIF TG_TABLE_NAME = 'programmes' THEN
      v_programme_id := v_target_id;
    ELSIF TG_TABLE_NAME = 'programme_members' THEN
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
$func$;