
-- Phase 52c verification helpers (will be dropped at end of section 6)

CREATE OR REPLACE FUNCTION public.fn_verify_phase52c_setup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_viewer_id uuid := gen_random_uuid();
  v_nonmember_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_programme_id uuid;
  v_personal_actor_id uuid;
  v_queue_id uuid;
  v_personal_actor_id_2 uuid;
  v_queue_id_2 uuid;
  v_personal_actor_id_3 uuid;
  v_queue_id_3 uuid;
  v_actor_id uuid;
BEGIN
  -- Create test users
  INSERT INTO public.users (id, email, name, role, access_tier)
  VALUES
    (v_owner_id, 'verify52c_owner@test.com', 'Owner', 'user', 'tier_3'),
    (v_viewer_id, 'verify52c_viewer@test.com', 'Viewer', 'user', 'tier_3'),
    (v_nonmember_id, 'verify52c_nonmember@test.com', 'NonMember', 'user', 'tier_3'),
    (v_admin_id, 'verify52c_admin@test.com', 'Admin', 'admin', 'tier_3');

  -- Create programme (owner)
  INSERT INTO public.programmes (name, owner_user_id, status)
  VALUES ('VERIFY52C Programme', v_owner_id, 'active')
  RETURNING id INTO v_programme_id;

  -- Add viewer as member with role 'viewer'
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
  VALUES (v_programme_id, v_viewer_id, 'viewer', v_owner_id);

  -- Pre-existing actor for re-verify test
  INSERT INTO public.actors (legal_name, source, verification_status)
  VALUES ('VERIFY52C Existing Actor', 'manual', 'verified')
  RETURNING id INTO v_actor_id;

  -- First verification event for that actor
  INSERT INTO public.verification_events (actor_id, verifier_id, programme_id, verification_status, evidence, decays_at, verifier_confidence, completed_at)
  VALUES (v_actor_id, v_owner_id, v_programme_id, 'complete', '[]'::jsonb, now() + interval '90 days', 'medium', now());

  UPDATE public.actors SET verified_at = now(), verifier_id = v_owner_id, decays_at = now() + interval '90 days', verifier_confidence = 'medium' WHERE id = v_actor_id;

  -- Personal actor #1 (for approve flow) — owned by viewer
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal A', 'NO', 'suggested', now())
  RETURNING id INTO v_personal_actor_id;

  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id;

  -- Personal actor #2 (for reject flow)
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal B', 'SE', 'suggested', now())
  RETURNING id INTO v_personal_actor_id_2;

  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id_2, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id_2;

  -- Personal actor #3 (for permission tests — extra)
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal C', 'DK', 'suggested', now())
  RETURNING id INTO v_personal_actor_id_3;

  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id_3, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id_3;

  RETURN jsonb_build_object(
    'owner_id', v_owner_id,
    'viewer_id', v_viewer_id,
    'nonmember_id', v_nonmember_id,
    'admin_id', v_admin_id,
    'programme_id', v_programme_id,
    'personal_actor_id', v_personal_actor_id,
    'queue_id', v_queue_id,
    'personal_actor_id_2', v_personal_actor_id_2,
    'queue_id_2', v_queue_id_2,
    'personal_actor_id_3', v_personal_actor_id_3,
    'queue_id_3', v_queue_id_3,
    'existing_actor_id', v_actor_id
  );
END $$;

-- Helper to invoke an RPC as a specific user
CREATE OR REPLACE FUNCTION public.fn_verify_phase52c_as_user(p_user_id uuid, p_op text, p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
  v_result_uuid uuid;
BEGIN
  -- Set the JWT claim so auth.uid() returns p_user_id
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text)::text, true);

  IF p_op = 'approve_and_verify' THEN
    SELECT public.fn_approve_and_verify(
      (p_args->>'queue_id')::uuid,
      COALESCE(p_args->'evidence', '[]'::jsonb),
      (p_args->>'decays_at')::timestamptz,
      p_args->>'confidence',
      p_args->>'notes',
      (p_args->>'programme_id')::uuid
    ) INTO v_result;
    RETURN jsonb_build_object('ok', true, 'result', v_result);
  ELSIF p_op = 'verify_actor' THEN
    SELECT public.fn_verify_actor(
      (p_args->>'actor_id')::uuid,
      COALESCE(p_args->'evidence', '[]'::jsonb),
      (p_args->>'decays_at')::timestamptz,
      p_args->>'confidence',
      p_args->>'notes',
      (p_args->>'programme_id')::uuid
    ) INTO v_result_uuid;
    RETURN jsonb_build_object('ok', true, 'event_id', v_result_uuid);
  ELSIF p_op = 'reject_suggestion' THEN
    SELECT public.fn_reject_suggestion(
      (p_args->>'queue_id')::uuid,
      p_args->>'reason',
      (p_args->>'programme_id')::uuid
    ) INTO v_result_uuid;
    RETURN jsonb_build_object('ok', true, 'queue_id', v_result_uuid);
  ELSE
    RAISE EXCEPTION 'unknown_op';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;
