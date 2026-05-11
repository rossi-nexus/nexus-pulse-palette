CREATE OR REPLACE FUNCTION public.fn_onboard_verified_actor(
  p_identity        jsonb,
  p_ontology_items  jsonb,
  p_verification    jsonb,
  p_programme_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_actor_id      uuid;
  v_legal_name    text;
  v_authorised    boolean;
  v_item          jsonb;
  v_entry_id      uuid;
  v_entry_name    text;
  v_matched       int := 0;
  v_unmatched     text[] := ARRAY[]::text[];
  v_event_id      uuid;
  v_decays_at     timestamptz;
  v_confidence    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorised — no auth.uid()' USING ERRCODE = '42501';
  END IF;

  IF p_programme_id IS NULL THEN
    RAISE EXCEPTION 'programme_id is required' USING ERRCODE = '23502';
  END IF;

  SELECT public.is_admin(v_uid) OR EXISTS (
    SELECT 1 FROM public.programme_members pm
    WHERE pm.programme_id = p_programme_id
      AND pm.user_id = v_uid
      AND pm.role IN ('owner', 'consultant')
  ) INTO v_authorised;

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'unauthorised — caller is neither admin nor owner/consultant on programme %', p_programme_id
      USING ERRCODE = '42501';
  END IF;

  v_legal_name := NULLIF(trim(p_identity->>'legal_name'), '');
  IF v_legal_name IS NULL THEN
    RAISE EXCEPTION 'legal_name is required' USING ERRCODE = '23502';
  END IF;

  v_decays_at := NULLIF(p_verification->>'decays_at', '')::timestamptz;
  v_confidence := NULLIF(p_verification->>'confidence', '');

  INSERT INTO public.actors (
    legal_name, org_number, country, websites,
    street_address, city, region, trade_names,
    source, verification_status, verified_at, verifier_id,
    verifier_confidence, decays_at
  )
  VALUES (
    v_legal_name,
    NULLIF(p_identity->>'org_number', ''),
    NULLIF(p_identity->>'country', ''),
    CASE WHEN p_identity ? 'websites'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_identity->'websites'))
         ELSE '{}'::text[] END,
    NULLIF(p_identity->>'street_address', ''),
    NULLIF(p_identity->>'city', ''),
    NULLIF(p_identity->>'region', ''),
    CASE WHEN p_identity ? 'trade_names'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_identity->'trade_names'))
         ELSE '{}'::text[] END,
    'consultant_onboarding',
    'verified',
    now(),
    v_uid,
    v_confidence,
    v_decays_at
  )
  RETURNING id INTO v_actor_id;

  IF p_ontology_items IS NOT NULL AND jsonb_typeof(p_ontology_items) = 'array'
     AND jsonb_array_length(p_ontology_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_ontology_items) LOOP
      v_entry_name := trim(v_item->>'entry_name');
      IF v_entry_name IS NULL OR v_entry_name = '' THEN CONTINUE; END IF;

      SELECT id INTO v_entry_id
      FROM public.ontology_entries
      WHERE lower(raw_name) = lower(v_entry_name)
        AND status = 'active'
      LIMIT 1;

      IF v_entry_id IS NOT NULL THEN
        -- actor_ontology_tags has no verified_at/verifier_id/decays_at/verifier_confidence
        -- and no unique (actor_id, ontology_entry_id) constraint.
        -- source CHECK only allows 'search'|'manual'|'api_connector' → use 'manual'.
        IF NOT EXISTS (
          SELECT 1 FROM public.actor_ontology_tags
          WHERE actor_id = v_actor_id AND ontology_entry_id = v_entry_id
        ) THEN
          INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
          VALUES (v_actor_id, v_entry_id, 'manual');
        END IF;
        v_matched := v_matched + 1;
      ELSE
        v_unmatched := array_append(v_unmatched, v_entry_name);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.verification_events (
    actor_id, verifier_id, programme_id, verification_status,
    evidence, decays_at, verifier_confidence, verifier_notes, completed_at
  )
  VALUES (
    v_actor_id, v_uid, p_programme_id, 'complete',
    COALESCE(p_verification->'evidence', '[]'::jsonb),
    v_decays_at, v_confidence,
    NULLIF(p_verification->>'notes', ''),
    now()
  )
  RETURNING id INTO v_event_id;

  PERFORM public.fn_audit_log_event(
    'onboard_verified_actor',
    'actors',
    v_actor_id,
    v_actor_id,
    p_programme_id,
    jsonb_build_object(
      'legal_name', v_legal_name,
      'verification_event_id', v_event_id,
      'ontology_matched_count', v_matched,
      'ontology_unmatched_count', cardinality(v_unmatched),
      'ontology_unmatched', to_jsonb(v_unmatched)
    ),
    NULLIF(p_verification->>'notes', '')
  );

  RETURN jsonb_build_object(
    'actor_id', v_actor_id,
    'verification_event_id', v_event_id,
    'ontology_matched_count', v_matched,
    'ontology_unmatched', to_jsonb(v_unmatched)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_onboard_verified_actor(jsonb, jsonb, jsonb, uuid) TO authenticated;