CREATE OR REPLACE FUNCTION public.fn_verify_phase49b_s1()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_aid uuid;
  v_diff jsonb;
BEGIN
  INSERT INTO public.actors (legal_name, source)
  VALUES ('VERIFY49B_UPDATE_DIFF', 'manual')
  RETURNING id INTO v_aid;

  UPDATE public.actors SET legal_name = 'VERIFY49B_UPDATE_DIFF_RENAMED' WHERE id = v_aid;

  SELECT changes INTO v_diff
  FROM public.audit_log
  WHERE target_table = 'actors'
    AND target_record_id = v_aid
    AND changes ? 'legal_name'
  ORDER BY created_at DESC LIMIT 1;

  -- Cleanup audit first (FK), then actor
  DELETE FROM public.audit_log WHERE target_table='actors' AND target_record_id = v_aid;
  DELETE FROM public.actors WHERE id = v_aid;

  RETURN QUERY VALUES
    ('update_diff_has_legal_name_key', (v_diff ? 'legal_name')::text),
    ('update_diff_from', v_diff->'legal_name'->>'from'),
    ('update_diff_to', v_diff->'legal_name'->>'to');
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase49b_s2()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_aid uuid;
  v_before int;
  v_after int;
BEGIN
  INSERT INTO public.actors (legal_name, source)
  VALUES ('VERIFY49B_NOOP', 'manual')
  RETURNING id INTO v_aid;

  SELECT count(*) INTO v_before
  FROM public.audit_log WHERE target_table='actors' AND target_record_id = v_aid;

  UPDATE public.actors SET legal_name = 'VERIFY49B_NOOP' WHERE id = v_aid;

  SELECT count(*) INTO v_after
  FROM public.audit_log WHERE target_table='actors' AND target_record_id = v_aid;

  DELETE FROM public.audit_log WHERE target_table='actors' AND target_record_id = v_aid;
  DELETE FROM public.actors WHERE id = v_aid;

  RETURN QUERY VALUES
    ('noop_count_before', v_before::text),
    ('noop_count_after', v_after::text);
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase49b_s3()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_aid uuid;
  v_payload jsonb;
  v_err text;
BEGIN
  INSERT INTO public.actors (legal_name, source)
  VALUES ('VERIFY49B_DELETE', 'manual')
  RETURNING id INTO v_aid;

  BEGIN
    DELETE FROM public.actors WHERE id = v_aid;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  SELECT changes INTO v_payload
  FROM public.audit_log
  WHERE target_table='actors' AND target_record_id = v_aid AND changes ? 'old'
  ORDER BY created_at DESC LIMIT 1;

  -- Cleanup
  DELETE FROM public.audit_log WHERE target_table='actors' AND target_record_id = v_aid;
  DELETE FROM public.actors WHERE id = v_aid;

  RETURN QUERY VALUES
    ('delete_error', COALESCE(v_err, 'none')),
    ('delete_payload_has_old_key', (v_payload ? 'old')::text),
    ('delete_payload_old_legal_name', v_payload->'old'->>'legal_name');
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_verify_phase49b_s1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase49b_s2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase49b_s3() TO authenticated;