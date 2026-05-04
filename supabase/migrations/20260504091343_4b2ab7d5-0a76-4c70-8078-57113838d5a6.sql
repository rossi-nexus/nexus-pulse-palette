
CREATE OR REPLACE FUNCTION public.fn_verify_phase52c_setup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id uuid := 'c1ab2290-d262-4316-99e6-9d6644e145e7'::uuid;     -- user.t1
  v_viewer_id uuid := '41a86d77-f9e1-4592-8705-2183b9b2bd13'::uuid;    -- user.t2
  v_nonmember_id uuid := '4de895f0-03c8-4cfc-8732-d6c1e8b6983a'::uuid; -- user.t3
  v_admin_id uuid := '9a0b74fa-4b8c-4ebd-82c2-0e899af46a39'::uuid;     -- admin
  v_programme_id uuid;
  v_personal_actor_id uuid;
  v_queue_id uuid;
  v_personal_actor_id_2 uuid;
  v_queue_id_2 uuid;
  v_personal_actor_id_3 uuid;
  v_queue_id_3 uuid;
  v_personal_actor_id_4 uuid;
  v_queue_id_4 uuid;
  v_actor_id uuid;
BEGIN
  -- Programme owned by t1
  INSERT INTO public.programmes (name, owner_user_id, status)
  VALUES ('VERIFY52C Programme', v_owner_id, 'active')
  RETURNING id INTO v_programme_id;
  -- (trigger fn_programme_add_owner_member adds owner to programme_members)

  -- Add viewer (t2) as 'viewer' role
  INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
  VALUES (v_programme_id, v_viewer_id, 'viewer', v_owner_id);

  -- Pre-existing actor for re-verify test
  INSERT INTO public.actors (legal_name, source, verification_status)
  VALUES ('VERIFY52C Existing Actor', 'manual', 'verified')
  RETURNING id INTO v_actor_id;

  INSERT INTO public.verification_events (actor_id, verifier_id, programme_id, verification_status, evidence, decays_at, verifier_confidence, completed_at)
  VALUES (v_actor_id, v_owner_id, v_programme_id, 'complete', '[]'::jsonb, now() + interval '90 days', 'medium', now());

  UPDATE public.actors SET verified_at = now(), verifier_id = v_owner_id, decays_at = now() + interval '90 days', verifier_confidence = 'medium' WHERE id = v_actor_id;

  -- Personal actor #1 (approve flow) — owned by viewer (t2)
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal A', 'NO', 'suggested', now())
  RETURNING id INTO v_personal_actor_id;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id;

  -- Personal actor #2 (reject flow)
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal B', 'SE', 'suggested', now())
  RETURNING id INTO v_personal_actor_id_2;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id_2, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id_2;

  -- Personal actor #3 (permission test — non-member attempt)
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal C', 'DK', 'suggested', now())
  RETURNING id INTO v_personal_actor_id_3;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id_3, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id_3;

  -- Personal actor #4 (admin no-programme test)
  INSERT INTO public.user_personal_actors (user_id, actor_name, country, status, suggested_at)
  VALUES (v_viewer_id, 'VERIFY52C Personal D', 'FI', 'suggested', now())
  RETURNING id INTO v_personal_actor_id_4;
  INSERT INTO public.actor_validation_queue (user_personal_actor_id, suggested_by, status)
  VALUES (v_personal_actor_id_4, v_viewer_id, 'pending')
  RETURNING id INTO v_queue_id_4;

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
    'personal_actor_id_4', v_personal_actor_id_4,
    'queue_id_4', v_queue_id_4,
    'existing_actor_id', v_actor_id
  );
END $$;
