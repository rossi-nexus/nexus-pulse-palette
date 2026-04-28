CREATE OR REPLACE FUNCTION public.fn_verify_phase49b()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_aid uuid;
  v_diff jsonb;
  v_old_legal text;
  v_new_legal text;
  v_count_before int;
  v_count_after int;
  v_aid2 uuid;
  v_aid3 uuid;
  v_delete_payload jsonb;
  v_delete_old_name text;
BEGIN
  -- Section 1: UPDATE diff test
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

  v_old_legal := v_diff->'legal_name'->>'from';
  v_new_legal := v_diff->'legal_name'->>'to';

  -- Section 2: no-op UPDATE skip test
  INSERT INTO public.actors (legal_name, source)
  VALUES ('VERIFY49B_NOOP', 'manual')
  RETURNING id INTO v_aid2;

  SELECT count(*) INTO v_count_before
  FROM public.audit_log
  WHERE target_table = 'actors' AND target_record_id = v_aid2;

  UPDATE public.actors SET legal_name = 'VERIFY49B_NOOP' WHERE id = v_aid2;

  SELECT count(*) INTO v_count_after
  FROM public.audit_log
  WHERE target_table = 'actors' AND target_record_id = v_aid2;

  -- Section 3: DELETE branch test
  INSERT INTO public.actors (legal_name, source)
  VALUES ('VERIFY49B_DELETE', 'manual')
  RETURNING id INTO v_aid3;

  DELETE FROM public.actors WHERE id = v_aid3;

  SELECT changes INTO v_delete_payload
  FROM public.audit_log
  WHERE target_table = 'actors'
    AND target_record_id = v_aid3
    AND changes ? 'old'
  ORDER BY created_at DESC LIMIT 1;

  v_delete_old_name := v_delete_payload->'old'->>'legal_name';

  -- Cleanup
  DELETE FROM public.actors WHERE id IN (v_aid, v_aid2);
  DELETE FROM public.audit_log
  WHERE target_table = 'actors'
    AND target_record_id IN (v_aid, v_aid2, v_aid3);

  RETURN QUERY VALUES
    ('update_diff_has_legal_name_key', (v_diff ? 'legal_name')::text),
    ('update_diff_from', v_old_legal),
    ('update_diff_to', v_new_legal),
    ('noop_count_before', v_count_before::text),
    ('noop_count_after', v_count_after::text),
    ('delete_payload_has_old_key', (v_delete_payload ? 'old')::text),
    ('delete_payload_old_legal_name', v_delete_old_name);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_verify_phase49b() TO authenticated;