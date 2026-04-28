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
    SELECT count(*)::int INTO v_member_audit_count
      FROM public.audit_log
      WHERE target_table = 'programme_members' AND programme_id = v_pid;
    SELECT bool_and(target_record_id IS NULL) INTO v_member_audit_target_id_is_null
      FROM public.audit_log
      WHERE target_table = 'programme_members' AND programme_id = v_pid;
    SELECT programme_id, changes INTO v_member_audit_programme_id, v_member_audit_changes
      FROM public.audit_log
      WHERE target_table = 'programme_members' AND programme_id = v_pid
      ORDER BY created_at DESC LIMIT 1;
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

CREATE TABLE IF NOT EXISTS public._verify49d_results (section text, label text, value text, ord serial);
TRUNCATE public._verify49d_results;

INSERT INTO public._verify49d_results (section, label, value)
SELECT 'S1_programme_create', label, value FROM public.fn_verify_phase49d_programme_create();

INSERT INTO public._verify49d_results (section, label, value)
SELECT 'S2_actor_delete', label, value FROM public.fn_verify_phase49d_actor_delete();

INSERT INTO public._verify49d_results (section, label, value)
SELECT 'S3_programme_delete', label, value FROM public.fn_verify_phase49d_programme_delete();

INSERT INTO public._verify49d_results (section, label, value)
SELECT 'S4_update_diff', label, value FROM public.fn_verify_phase49d_update();

DROP FUNCTION IF EXISTS public.fn_verify_phase49d_programme_create();
DROP FUNCTION IF EXISTS public.fn_verify_phase49d_actor_delete();
DROP FUNCTION IF EXISTS public.fn_verify_phase49d_programme_delete();
DROP FUNCTION IF EXISTS public.fn_verify_phase49d_update();
DROP FUNCTION IF EXISTS public.fn_verify_phase49c_delete();
DROP FUNCTION IF EXISTS public.fn_verify_phase49c_update();
DROP FUNCTION IF EXISTS public.fn_verify_phase49c_programme_delete();