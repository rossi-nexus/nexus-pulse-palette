CREATE OR REPLACE FUNCTION public.fn_verify_phase52b_approve()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid;
  v_session_id uuid;
  v_programme_id uuid;
  v_personal_actor_id uuid;
  v_queue_id uuid;
  v_rpc_result jsonb;
  v_actor_id uuid;
  v_event_id uuid;
  v_audit_count_before bigint;
  v_audit_delta bigint;
  v_event_count int;
  v_actor_verified_at timestamptz;
  v_actor_decays_at timestamptz;
  v_actor_status text;
  v_personal_status text;
  v_queue_status text;
BEGIN
  SELECT id INTO v_user_id FROM public.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN QUERY VALUES ('skipped', 'no users in DB'); RETURN;
  END IF;

  INSERT INTO public.programmes (name, owner_user_id) VALUES ('VERIFY52B', v_user_id) RETURNING id INTO v_programme_id;
  -- ensure programme owner membership (trigger should add, but be safe)
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
    VALUES (v_programme_id, v_user_id, 'owner', v_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.search_sessions (user_id, programme_id, status) VALUES (v_user_id, v_programme_id, 'active') RETURNING id INTO v_session_id;
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
    VALUES (v_user_id, 'VERIFY52B_actor', 'NO', 'personal', v_session_id) RETURNING id INTO v_personal_actor_id;

  UPDATE public.user_personal_actors SET status = 'suggested', suggested_at = now() WHERE id = v_personal_actor_id;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
    VALUES (v_personal_actor_id, v_user_id, 'pending') RETURNING id INTO v_queue_id;

  SELECT count(*) INTO v_audit_count_before FROM public.audit_log;

  -- Bypass auth.uid() programme membership check by impersonating via JWT claims for this txn
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id::text)::text, true);

  v_rpc_result := public.fn_approve_and_verify(
    v_queue_id,
    '[{"source_url":"https://example.com","note":"test source"}]'::jsonb,
    (now() + interval '90 days'),
    'high',
    'test verification',
    v_programme_id
  );

  v_actor_id := (v_rpc_result->>'actor_id')::uuid;
  v_event_id := (v_rpc_result->>'event_id')::uuid;

  SELECT verified_at, decays_at, verification_status INTO v_actor_verified_at, v_actor_decays_at, v_actor_status
    FROM public.actors WHERE id = v_actor_id;
  SELECT count(*) INTO v_event_count FROM public.verification_events WHERE id = v_event_id;
  SELECT status INTO v_queue_status FROM public.actor_validation_queue WHERE id = v_queue_id;
  SELECT status INTO v_personal_status FROM public.user_personal_actors WHERE id = v_personal_actor_id;
  SELECT count(*) - v_audit_count_before INTO v_audit_delta FROM public.audit_log;

  RETURN QUERY VALUES
    ('rpc_returned_actor_id', v_actor_id::text),
    ('rpc_returned_event_id', v_event_id::text),
    ('actors_verified_at_set', (v_actor_verified_at IS NOT NULL)::text),
    ('actors_decays_at_set', (v_actor_decays_at IS NOT NULL)::text),
    ('actors_verification_status', v_actor_status),
    ('verification_events_row_exists', (v_event_count = 1)::text),
    ('queue_status', v_queue_status),
    ('personal_actor_status', v_personal_status),
    ('audit_log_delta', v_audit_delta::text);

  -- Cleanup
  DELETE FROM public.audit_log WHERE actor_id = v_actor_id OR programme_id = v_programme_id;
  DELETE FROM public.verification_events WHERE id = v_event_id;
  DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
  DELETE FROM public.user_personal_actors WHERE id = v_personal_actor_id;
  DELETE FROM public.actors WHERE id = v_actor_id;
  DELETE FROM public.search_sessions WHERE id = v_session_id;
  DELETE FROM public.programme_members WHERE programme_id = v_programme_id;
  DELETE FROM public.programmes WHERE id = v_programme_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase52b_reverify()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid;
  v_programme_id uuid;
  v_actor_id uuid;
  v_first_event_id uuid;
  v_second_event_id uuid;
  v_audit_before bigint;
  v_audit_delta bigint;
  v_event_count int;
  v_actor_decays_at timestamptz;
  v_actor_confidence text;
BEGIN
  SELECT id INTO v_user_id FROM public.users LIMIT 1;
  INSERT INTO public.programmes (name, owner_user_id) VALUES ('VERIFY52B_rv', v_user_id) RETURNING id INTO v_programme_id;
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
    VALUES (v_programme_id, v_user_id, 'owner', v_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.actors (legal_name, source, verification_status, verified_at, decays_at, verifier_confidence, verifier_id)
    VALUES ('VERIFY52B_rv_actor', 'test', 'verified', now() - interval '30 days', now() + interval '30 days', 'medium', v_user_id)
    RETURNING id INTO v_actor_id;
  INSERT INTO public.verification_events (actor_id, verifier_id, programme_id, verification_status, evidence, decays_at, verifier_confidence, completed_at)
    VALUES (v_actor_id, v_user_id, v_programme_id, 'complete', '[]'::jsonb, now() + interval '30 days', 'medium', now() - interval '30 days')
    RETURNING id INTO v_first_event_id;

  SELECT count(*) INTO v_audit_before FROM public.audit_log;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id::text)::text, true);

  v_second_event_id := public.fn_verify_actor(
    v_actor_id,
    '[{"source_url":"https://example.com/renew"}]'::jsonb,
    now() + interval '180 days',
    'high',
    're-verify test',
    v_programme_id
  );

  SELECT count(*) INTO v_event_count FROM public.verification_events WHERE actor_id = v_actor_id;
  SELECT decays_at, verifier_confidence INTO v_actor_decays_at, v_actor_confidence FROM public.actors WHERE id = v_actor_id;
  SELECT count(*) - v_audit_before INTO v_audit_delta FROM public.audit_log;

  RETURN QUERY VALUES
    ('event_count_for_actor', v_event_count::text),
    ('actor_confidence_now', v_actor_confidence),
    ('actor_decays_in_future_180d', (v_actor_decays_at > now() + interval '170 days')::text),
    ('audit_log_delta', v_audit_delta::text);

  DELETE FROM public.audit_log WHERE actor_id = v_actor_id OR programme_id = v_programme_id;
  DELETE FROM public.verification_events WHERE actor_id = v_actor_id;
  DELETE FROM public.actors WHERE id = v_actor_id;
  DELETE FROM public.programme_members WHERE programme_id = v_programme_id;
  DELETE FROM public.programmes WHERE id = v_programme_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase52b_reject()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid;
  v_programme_id uuid;
  v_session_id uuid;
  v_personal_actor_id uuid;
  v_queue_id uuid;
  v_audit_before bigint;
  v_audit_delta bigint;
  v_queue_status text;
  v_personal_status text;
  v_admin_notes text;
BEGIN
  SELECT id INTO v_user_id FROM public.users LIMIT 1;
  INSERT INTO public.programmes (name, owner_user_id) VALUES ('VERIFY52B_rj', v_user_id) RETURNING id INTO v_programme_id;
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
    VALUES (v_programme_id, v_user_id, 'owner', v_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.search_sessions (user_id, programme_id, status) VALUES (v_user_id, v_programme_id, 'active') RETURNING id INTO v_session_id;
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
    VALUES (v_user_id, 'VERIFY52B_rj_actor', 'NO', 'suggested', v_session_id) RETURNING id INTO v_personal_actor_id;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
    VALUES (v_personal_actor_id, v_user_id, 'pending') RETURNING id INTO v_queue_id;

  SELECT count(*) INTO v_audit_before FROM public.audit_log;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id::text)::text, true);

  PERFORM public.fn_reject_suggestion(v_queue_id, 'rejection reason test', v_programme_id);

  SELECT status, admin_notes INTO v_queue_status, v_admin_notes FROM public.actor_validation_queue WHERE id = v_queue_id;
  SELECT status INTO v_personal_status FROM public.user_personal_actors WHERE id = v_personal_actor_id;
  SELECT count(*) - v_audit_before INTO v_audit_delta FROM public.audit_log;

  RETURN QUERY VALUES
    ('queue_status', v_queue_status),
    ('personal_actor_status', v_personal_status),
    ('admin_notes', v_admin_notes),
    ('audit_log_delta', v_audit_delta::text);

  DELETE FROM public.audit_log WHERE programme_id = v_programme_id;
  DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
  DELETE FROM public.user_personal_actors WHERE id = v_personal_actor_id;
  DELETE FROM public.search_sessions WHERE id = v_session_id;
  DELETE FROM public.programme_members WHERE programme_id = v_programme_id;
  DELETE FROM public.programmes WHERE id = v_programme_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase52b_audit_breakdown()
RETURNS TABLE (target_table text, event_type text, n bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid;
  v_programme_id uuid;
  v_session_id uuid;
  v_personal_actor_id uuid;
  v_queue_id uuid;
  v_rpc_result jsonb;
  v_actor_id uuid;
  v_event_id uuid;
  v_audit_before bigint;
BEGIN
  SELECT id INTO v_user_id FROM public.users LIMIT 1;
  INSERT INTO public.programmes (name, owner_user_id) VALUES ('VERIFY52B_ab', v_user_id) RETURNING id INTO v_programme_id;
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
    VALUES (v_programme_id, v_user_id, 'owner', v_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.search_sessions (user_id, programme_id, status) VALUES (v_user_id, v_programme_id, 'active') RETURNING id INTO v_session_id;
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
    VALUES (v_user_id, 'VERIFY52B_ab_actor', 'NO', 'suggested', v_session_id) RETURNING id INTO v_personal_actor_id;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
    VALUES (v_personal_actor_id, v_user_id, 'pending') RETURNING id INTO v_queue_id;

  SELECT count(*) INTO v_audit_before FROM public.audit_log;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id::text)::text, true);

  v_rpc_result := public.fn_approve_and_verify(
    v_queue_id, '[]'::jsonb, now() + interval '90 days', 'high', 'audit breakdown', v_programme_id
  );
  v_actor_id := (v_rpc_result->>'actor_id')::uuid;
  v_event_id := (v_rpc_result->>'event_id')::uuid;

  RETURN QUERY
    SELECT al.target_table, al.event_type, count(*)::bigint
    FROM public.audit_log al
    WHERE al.id IN (SELECT id FROM public.audit_log ORDER BY created_at DESC LIMIT 20)
      AND al.created_at >= (SELECT created_at FROM public.audit_log ORDER BY created_at OFFSET v_audit_before LIMIT 1)
    GROUP BY al.target_table, al.event_type
    ORDER BY al.target_table, al.event_type;

  DELETE FROM public.audit_log WHERE actor_id = v_actor_id OR programme_id = v_programme_id;
  DELETE FROM public.verification_events WHERE id = v_event_id;
  DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
  DELETE FROM public.user_personal_actors WHERE id = v_personal_actor_id;
  DELETE FROM public.actors WHERE id = v_actor_id;
  DELETE FROM public.search_sessions WHERE id = v_session_id;
  DELETE FROM public.programme_members WHERE programme_id = v_programme_id;
  DELETE FROM public.programmes WHERE id = v_programme_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.fn_verify_phase52b_perms()
RETURNS TABLE (label text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_owner uuid;
  v_nonmember uuid;
  v_viewer uuid;
  v_admin uuid;
  v_programme_id uuid;
  v_session_id uuid;
  v_pa_id uuid;
  v_queue_id uuid;
  v_err text;
  v_result jsonb;
BEGIN
  -- pick distinct users
  SELECT id INTO v_owner FROM public.users WHERE role <> 'admin' LIMIT 1;
  SELECT id INTO v_nonmember FROM public.users WHERE id <> v_owner AND role <> 'admin' LIMIT 1;
  SELECT id INTO v_viewer FROM public.users WHERE id NOT IN (v_owner, v_nonmember) AND role <> 'admin' LIMIT 1;
  SELECT id INTO v_admin FROM public.users WHERE role = 'admin' LIMIT 1;

  RETURN QUERY VALUES
    ('user_owner', COALESCE(v_owner::text,'NULL')),
    ('user_nonmember', COALESCE(v_nonmember::text,'NULL')),
    ('user_viewer', COALESCE(v_viewer::text,'NULL')),
    ('user_admin', COALESCE(v_admin::text,'NULL'));

  IF v_owner IS NULL THEN RETURN; END IF;

  -- Setup programme owned by v_owner; queue row
  INSERT INTO public.programmes (name, owner_user_id) VALUES ('VERIFY52B_perm', v_owner) RETURNING id INTO v_programme_id;
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
    VALUES (v_programme_id, v_owner, 'owner', v_owner) ON CONFLICT DO NOTHING;
  IF v_viewer IS NOT NULL THEN
    INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
      VALUES (v_programme_id, v_viewer, 'viewer', v_owner) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.search_sessions (user_id, programme_id, status) VALUES (v_owner, v_programme_id, 'active') RETURNING id INTO v_session_id;

  -- Test 8: non-member
  IF v_nonmember IS NOT NULL THEN
    INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
      VALUES (v_owner, 'perm_t8', 'NO', 'suggested', v_session_id) RETURNING id INTO v_pa_id;
    INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
      VALUES (v_pa_id, v_owner, 'pending') RETURNING id INTO v_queue_id;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nonmember::text)::text, true);
      v_result := public.fn_approve_and_verify(v_queue_id, '[]'::jsonb, now() + interval '30 days', 'high', 'x', v_programme_id);
      RETURN QUERY VALUES ('test8_nonmember', 'UNEXPECTED_SUCCESS');
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY VALUES ('test8_nonmember_err', SQLERRM);
    END;
    DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
    DELETE FROM public.user_personal_actors WHERE id = v_pa_id;
  END IF;

  -- Test 9: viewer
  IF v_viewer IS NOT NULL THEN
    INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
      VALUES (v_owner, 'perm_t9', 'NO', 'suggested', v_session_id) RETURNING id INTO v_pa_id;
    INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
      VALUES (v_pa_id, v_owner, 'pending') RETURNING id INTO v_queue_id;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer::text)::text, true);
      v_result := public.fn_approve_and_verify(v_queue_id, '[]'::jsonb, now() + interval '30 days', 'high', 'x', v_programme_id);
      RETURN QUERY VALUES ('test9_viewer', 'UNEXPECTED_SUCCESS');
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY VALUES ('test9_viewer_err', SQLERRM);
    END;
    DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
    DELETE FROM public.user_personal_actors WHERE id = v_pa_id;
  END IF;

  -- Test 10: owner
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
    VALUES (v_owner, 'perm_t10', 'NO', 'suggested', v_session_id) RETURNING id INTO v_pa_id;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
    VALUES (v_pa_id, v_owner, 'pending') RETURNING id INTO v_queue_id;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);
    v_result := public.fn_approve_and_verify(v_queue_id, '[]'::jsonb, now() + interval '30 days', 'high', 'x', v_programme_id);
    RETURN QUERY VALUES ('test10_owner', 'PASS actor=' || (v_result->>'actor_id'));
    DELETE FROM public.audit_log WHERE actor_id = (v_result->>'actor_id')::uuid;
    DELETE FROM public.verification_events WHERE id = (v_result->>'event_id')::uuid;
    DELETE FROM public.actors WHERE id = (v_result->>'actor_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY VALUES ('test10_owner_err', SQLERRM);
  END;
  DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
  DELETE FROM public.user_personal_actors WHERE id = v_pa_id;

  -- Test 11: admin no-programme
  IF v_admin IS NOT NULL THEN
    INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, source_session_id)
      VALUES (v_owner, 'perm_t11', 'NO', 'suggested', v_session_id) RETURNING id INTO v_pa_id;
    INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
      VALUES (v_pa_id, v_owner, 'pending') RETURNING id INTO v_queue_id;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
      v_result := public.fn_approve_and_verify(v_queue_id, '[]'::jsonb, now() + interval '30 days', 'high', 'x', NULL);
      RETURN QUERY VALUES ('test11_admin_noprog', 'PASS actor=' || (v_result->>'actor_id'));
      DELETE FROM public.audit_log WHERE actor_id = (v_result->>'actor_id')::uuid;
      DELETE FROM public.verification_events WHERE id = (v_result->>'event_id')::uuid;
      DELETE FROM public.actors WHERE id = (v_result->>'actor_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY VALUES ('test11_admin_noprog_err', SQLERRM);
    END;
    DELETE FROM public.actor_validation_queue WHERE id = v_queue_id;
    DELETE FROM public.user_personal_actors WHERE id = v_pa_id;
  ELSE
    RETURN QUERY VALUES ('test11_admin_noprog', 'SKIPPED no admin');
  END IF;

  -- Cleanup
  DELETE FROM public.audit_log WHERE programme_id = v_programme_id;
  DELETE FROM public.search_sessions WHERE id = v_session_id;
  DELETE FROM public.programme_members WHERE programme_id = v_programme_id;
  DELETE FROM public.programmes WHERE id = v_programme_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_verify_phase52b_approve() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase52b_reverify() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase52b_reject() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase52b_audit_breakdown() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_phase52b_perms() TO authenticated;