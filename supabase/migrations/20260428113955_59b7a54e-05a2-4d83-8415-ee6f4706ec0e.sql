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
  -- Build the changes payload AND derive target_id from JSONB representation.
  -- JSONB extraction (->>'id') gracefully returns NULL for composite-PK tables
  -- like programme_members, where there is no `id` column. Direct (NEW).id /
  -- (OLD).id access would error on those tables. Added in prompt 49d to fix
  -- the regression found by prompt 49c verification.
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_changes := jsonb_build_object('new', v_new);
    v_target_id := (v_new->>'id')::uuid;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_changes := jsonb_build_object('old', v_old);
    v_target_id := (v_old->>'id')::uuid;
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
    v_target_id := (v_new->>'id')::uuid;
  END IF;

  -- Resolve FK columns ONLY for non-DELETE operations (49c fix preserved).
  -- On DELETE, the parent row is being removed in the same statement; setting
  -- audit_log.actor_id/programme_id would violate FK constraints.
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