CREATE OR REPLACE FUNCTION public.fn_verify_phase49d_programme_create()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid;
  v_pid uuid;
  v_create_err text;
  v_member_audit_count int;
  v_member_audit_target_id_is_null boolean;
  v_member_audit_programme_id uuid;
  v_member_audit_changes jsonb;
BEGIN
  SELECT id INTO v_uid FROM public.users LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN QUERY VALUES ('skipped', 'no users');
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.programmes (name, owner_user_id)
    VALUES ('VERIFY49D_PROG', v_uid)
    RETURNING id INTO v_pid;
  EXCEPTION WHEN OTHERS THEN
    v_create_err := SQLERRM;
  END;

  IF v_create_err IS NULL THEN
    SELECT count(*), bool_and(target_record_id IS NULL),
           max(programme_id), max(changes)
      INTO v_member_audit_count, v_member_audit_target_id_is_null,
           v_member_audit_programme_id, v_member_audit_changes
    FROM public.audit_log
    WHERE target_table = 'programme_members'
      AND programme_id = v_pid;
  END IF;

  IF v_pid IS NOT NULL THEN
    DELETE FROM public.programmes WHERE id = v_pid;
    DELETE FROM public.audit_log WHERE programme_id = v_pid;
  END IF;

  RETURN QUERY VALUES
    ('programme_create_error', COALESCE(v_create_err, 'none')),
    ('member_audit_count', COALESCE(v_member_audit_count::text, 'null')),
    ('member_audit_target_id_is_null', COALESCE(v_member_audit_target_id_is_null::text, 'null')),
    ('member_audit_programme_id_set', (v_member_audit_programme_id IS NOT NULL)::text),
    ('member_audit_changes_has_user_id', (v_member_audit_changes->'new' ? 'user_id')::text);
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase49d_actor_delete()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_aid uuid;
  v_err text;
  v_actor_id_null boolean;
  v_has_old boolean;
BEGIN
  INSERT INTO public.actors (legal_name, source) VALUES ('VERIFY49D_DEL', 'manual') RETURNING id INTO v_aid;
  BEGIN
    DELETE FROM public.actors WHERE id = v_aid;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;

  SELECT (actor_id IS NULL), (changes ? 'old') INTO v_actor_id_null, v_has_old
  FROM public.audit_log WHERE target_record_id = v_aid AND changes ? 'old'
  ORDER BY created_at DESC LIMIT 1;

  DELETE FROM public.audit_log WHERE target_record_id = v_aid;
  RETURN QUERY VALUES
    ('delete_error', COALESCE(v_err, 'none')),
    ('audit_actor_id_null', COALESCE(v_actor_id_null::text, 'null')),
    ('audit_has_old_payload', COALESCE(v_has_old::text, 'null'));
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase49d_programme_delete()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid;
  v_pid uuid;
  v_err text;
BEGIN
  SELECT id INTO v_uid FROM public.users LIMIT 1;
  IF v_uid IS NULL THEN RETURN QUERY VALUES ('skipped','no users'); RETURN; END IF;
  INSERT INTO public.programmes (name, owner_user_id) VALUES ('VERIFY49D_PDEL', v_uid) RETURNING id INTO v_pid;
  BEGIN
    DELETE FROM public.programmes WHERE id = v_pid;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  DELETE FROM public.audit_log WHERE programme_id = v_pid OR target_record_id = v_pid;
  RETURN QUERY VALUES ('programme_delete_error', COALESCE(v_err, 'none'));
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase49d_update()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_aid uuid;
  v_diff jsonb;
  v_before bigint;
  v_after bigint;
BEGIN
  INSERT INTO public.actors (legal_name, source) VALUES ('VERIFY49D_UPD', 'manual') RETURNING id INTO v_aid;
  UPDATE public.actors SET legal_name = 'VERIFY49D_UPD_R' WHERE id = v_aid;
  SELECT changes INTO v_diff FROM public.audit_log
    WHERE target_record_id = v_aid AND changes ? 'legal_name'
    ORDER BY created_at DESC LIMIT 1;
  SELECT count(*) INTO v_before FROM public.audit_log WHERE target_record_id = v_aid;
  UPDATE public.actors SET legal_name = 'VERIFY49D_UPD_R' WHERE id = v_aid;
  SELECT count(*) INTO v_after FROM public.audit_log WHERE target_record_id = v_aid;
  DELETE FROM public.actors WHERE id = v_aid;
  DELETE FROM public.audit_log WHERE target_record_id = v_aid;
  RETURN QUERY VALUES
    ('diff_from', v_diff->'legal_name'->>'from'),
    ('diff_to', v_diff->'legal_name'->>'to'),
    ('noop_before', v_before::text),
    ('noop_after', v_after::text);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_verify_phase49d_programme_create() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase49d_actor_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase49d_programme_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase49d_update() TO authenticated;