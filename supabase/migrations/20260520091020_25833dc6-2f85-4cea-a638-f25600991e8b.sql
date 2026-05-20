-- B4: extend actor_ontology_tags.source CHECK to allow 'consultant_completion'
ALTER TABLE public.actor_ontology_tags
  DROP CONSTRAINT IF EXISTS actor_ontology_tags_source_check;
ALTER TABLE public.actor_ontology_tags
  ADD CONSTRAINT actor_ontology_tags_source_check
  CHECK (source = ANY (ARRAY['search'::text, 'manual'::text, 'api_connector'::text, 'consultant_completion'::text]));

-- B4: extend fn_approve_and_verify with p_consultant_decisions (defaulted)
CREATE OR REPLACE FUNCTION public.fn_approve_and_verify(
  p_queue_id uuid,
  p_evidence jsonb,
  p_decays_at timestamptz,
  p_confidence text,
  p_notes text,
  p_programme_id uuid DEFAULT NULL,
  p_consultant_decisions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personal_actor_id uuid;
  v_personal_actor record;
  v_actor_id uuid;
  v_event_id uuid;
  v_caller_can_verify boolean;
  v_decision jsonb;
  v_action text;
  v_proposed_name text;
  v_proposed_cat uuid;
  v_mapped_entry uuid;
  v_proposed_desc text;
  v_new_entry_id uuid;
  v_decision_count int := 0;
  v_new_entry_count int := 0;
  v_mapped_count int := 0;
  v_audit_reason text;
BEGIN
  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(auth.uid()) INTO v_caller_can_verify;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','consultant')
    ) OR public.is_admin(auth.uid()) INTO v_caller_can_verify;
  END IF;

  IF NOT v_caller_can_verify THEN
    RAISE EXCEPTION 'verification_permission_denied'
      USING HINT = 'Caller is not a programme owner/consultant or admin.';
  END IF;

  SELECT user_personal_actor_id INTO v_personal_actor_id
  FROM public.actor_validation_queue WHERE id = p_queue_id;

  IF v_personal_actor_id IS NULL THEN
    RAISE EXCEPTION 'queue_row_not_found' USING HINT = 'Invalid queue id.';
  END IF;

  SELECT * INTO v_personal_actor
  FROM public.user_personal_actors
  WHERE id = v_personal_actor_id;

  v_actor_id := v_personal_actor.matched_main_db_actor_id;
  IF v_actor_id IS NULL THEN
    INSERT INTO public.actors (
      legal_name, country, org_number, source, verification_status, trade_names,
      street_address, city, region, websites
    ) VALUES (
      v_personal_actor.actor_name,
      v_personal_actor.country,
      v_personal_actor.org_number,
      'consultant_approval',
      'verified',
      COALESCE(v_personal_actor.trade_names, '{}'::text[]),
      v_personal_actor.street_address,
      v_personal_actor.city,
      v_personal_actor.region,
      CASE WHEN v_personal_actor.actor_website IS NOT NULL
           THEN ARRAY[v_personal_actor.actor_website]
           ELSE '{}'::text[] END
    ) RETURNING id INTO v_actor_id;
  END IF;

  INSERT INTO public.verification_events (
    actor_id, verifier_id, programme_id, source_queue_id, verification_status,
    evidence, decays_at, verifier_confidence, verifier_notes, completed_at
  ) VALUES (
    v_actor_id, auth.uid(), p_programme_id, p_queue_id, 'complete',
    COALESCE(p_evidence, '[]'::jsonb), p_decays_at, p_confidence, p_notes, now()
  ) RETURNING id INTO v_event_id;

  UPDATE public.actors
  SET verified_at = now(),
      verifier_id = auth.uid(),
      decays_at = p_decays_at,
      verifier_confidence = p_confidence,
      verification_status = 'verified'
  WHERE id = v_actor_id;

  UPDATE public.actor_validation_queue
  SET status = 'merged',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_queue_id;

  UPDATE public.user_personal_actors
  SET status = 'merged',
      matched_main_db_actor_id = v_actor_id,
      match_timestamp = now()
  WHERE id = v_personal_actor_id;

  -- B4: consultant decisions loop (ported from fn_onboard_verified_actor)
  IF p_consultant_decisions IS NOT NULL
     AND jsonb_typeof(p_consultant_decisions) = 'array'
     AND jsonb_array_length(p_consultant_decisions) > 0 THEN
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_consultant_decisions) LOOP
      v_action        := v_decision->>'action';
      v_proposed_name := NULLIF(trim(v_decision->>'proposed_name'), '');
      v_proposed_cat  := NULLIF(v_decision->>'proposed_category_id', '')::uuid;
      v_mapped_entry  := NULLIF(v_decision->>'mapped_to_entry_id', '')::uuid;
      v_proposed_desc := NULLIF(trim(v_decision->>'proposed_description'), '');
      v_new_entry_id  := NULL;
      v_decision_count := v_decision_count + 1;

      IF v_action = 'map-to-existing' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = v_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
            VALUES (v_actor_id, v_mapped_entry, 'consultant_completion');
          END IF;
          v_mapped_count := v_mapped_count + 1;
        END IF;
        v_audit_reason := format('map-to-existing: %L -> entry %s', v_proposed_name, v_mapped_entry);

      ELSIF v_action = 'accept-as-new' THEN
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;

          INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
          VALUES (v_actor_id, v_new_entry_id, 'consultant_completion');
          v_new_entry_count := v_new_entry_count + 1;
        END IF;
        v_audit_reason := format('accept-as-new: %L -> proposed entry %s', v_proposed_name, v_new_entry_id);

      ELSIF v_action = 'map-and-propose' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = v_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
            VALUES (v_actor_id, v_mapped_entry, 'consultant_completion');
          END IF;
          v_mapped_count := v_mapped_count + 1;
        END IF;
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;
          v_new_entry_count := v_new_entry_count + 1;
        END IF;
        v_audit_reason := format(
          'map-and-propose: %L -> entry %s + proposed entry %s',
          v_proposed_name, v_mapped_entry, v_new_entry_id
        );

      ELSIF v_action = 'reject' THEN
        v_audit_reason := format('reject: %L', v_proposed_name);

      ELSE
        CONTINUE;
      END IF;

      PERFORM public.fn_audit_log_event(
        'ontology_proposal_decision',
        'actors',
        v_actor_id,
        v_actor_id,
        p_programme_id,
        jsonb_build_object(
          'action', v_action,
          'proposed_name', v_proposed_name,
          'proposed_category_id', v_proposed_cat,
          'mapped_to_entry_id', v_mapped_entry,
          'new_entry_id', v_new_entry_id,
          'proposed_description', v_proposed_desc,
          'programme_id', p_programme_id,
          'source_rpc', 'fn_approve_and_verify'
        ),
        v_audit_reason
      );
    END LOOP;
  END IF;

  PERFORM public.fn_audit_log_event(
    'approve_and_verify',
    'actor_validation_queue',
    p_queue_id,
    v_actor_id,
    p_programme_id,
    jsonb_build_object(
      'event_id', v_event_id,
      'actor_id', v_actor_id,
      'personal_actor_id', v_personal_actor_id,
      'decays_at', p_decays_at,
      'confidence', p_confidence,
      'consultant_decision_count', v_decision_count,
      'consultant_new_entry_count', v_new_entry_count,
      'consultant_mapped_count', v_mapped_count
    ),
    p_notes
  );

  RETURN jsonb_build_object(
    'actor_id', v_actor_id,
    'event_id', v_event_id,
    'consultant_decision_count', v_decision_count,
    'consultant_new_entry_count', v_new_entry_count,
    'consultant_mapped_count', v_mapped_count
  );
END;
$$;

-- B4: extend fn_verify_actor with p_consultant_decisions (defaulted)
CREATE OR REPLACE FUNCTION public.fn_verify_actor(
  p_actor_id uuid,
  p_evidence jsonb,
  p_decays_at timestamptz,
  p_confidence text,
  p_notes text,
  p_programme_id uuid DEFAULT NULL,
  p_consultant_decisions jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_caller_can_verify boolean;
  v_decision jsonb;
  v_action text;
  v_proposed_name text;
  v_proposed_cat uuid;
  v_mapped_entry uuid;
  v_proposed_desc text;
  v_new_entry_id uuid;
  v_audit_reason text;
BEGIN
  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(auth.uid()) INTO v_caller_can_verify;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','consultant')
    ) OR public.is_admin(auth.uid()) INTO v_caller_can_verify;
  END IF;

  IF NOT v_caller_can_verify THEN
    RAISE EXCEPTION 'verification_permission_denied'
      USING HINT = 'Caller is not a programme owner/consultant or admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.actors WHERE id = p_actor_id) THEN
    RAISE EXCEPTION 'actor_not_found' USING HINT = 'Invalid actor id.';
  END IF;

  INSERT INTO public.verification_events (
    actor_id, verifier_id, programme_id, verification_status,
    evidence, decays_at, verifier_confidence, verifier_notes, completed_at
  ) VALUES (
    p_actor_id, auth.uid(), p_programme_id, 'complete',
    COALESCE(p_evidence, '[]'::jsonb), p_decays_at, p_confidence, p_notes, now()
  ) RETURNING id INTO v_event_id;

  UPDATE public.actors
  SET verified_at = now(),
      verifier_id = auth.uid(),
      decays_at = p_decays_at,
      verifier_confidence = p_confidence
  WHERE id = p_actor_id;

  -- B4: consultant decisions loop
  IF p_consultant_decisions IS NOT NULL
     AND jsonb_typeof(p_consultant_decisions) = 'array'
     AND jsonb_array_length(p_consultant_decisions) > 0 THEN
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_consultant_decisions) LOOP
      v_action        := v_decision->>'action';
      v_proposed_name := NULLIF(trim(v_decision->>'proposed_name'), '');
      v_proposed_cat  := NULLIF(v_decision->>'proposed_category_id', '')::uuid;
      v_mapped_entry  := NULLIF(v_decision->>'mapped_to_entry_id', '')::uuid;
      v_proposed_desc := NULLIF(trim(v_decision->>'proposed_description'), '');
      v_new_entry_id  := NULL;

      IF v_action = 'map-to-existing' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = p_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
            VALUES (p_actor_id, v_mapped_entry, 'consultant_completion');
          END IF;
        END IF;
        v_audit_reason := format('map-to-existing: %L -> entry %s', v_proposed_name, v_mapped_entry);

      ELSIF v_action = 'accept-as-new' THEN
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;
          INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
          VALUES (p_actor_id, v_new_entry_id, 'consultant_completion');
        END IF;
        v_audit_reason := format('accept-as-new: %L -> proposed entry %s', v_proposed_name, v_new_entry_id);

      ELSIF v_action = 'map-and-propose' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = p_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags (actor_id, ontology_entry_id, source)
            VALUES (p_actor_id, v_mapped_entry, 'consultant_completion');
          END IF;
        END IF;
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;
        END IF;
        v_audit_reason := format(
          'map-and-propose: %L -> entry %s + proposed entry %s',
          v_proposed_name, v_mapped_entry, v_new_entry_id
        );

      ELSIF v_action = 'reject' THEN
        v_audit_reason := format('reject: %L', v_proposed_name);

      ELSE
        CONTINUE;
      END IF;

      PERFORM public.fn_audit_log_event(
        'ontology_proposal_decision',
        'actors',
        p_actor_id,
        p_actor_id,
        p_programme_id,
        jsonb_build_object(
          'action', v_action,
          'proposed_name', v_proposed_name,
          'proposed_category_id', v_proposed_cat,
          'mapped_to_entry_id', v_mapped_entry,
          'new_entry_id', v_new_entry_id,
          'proposed_description', v_proposed_desc,
          'programme_id', p_programme_id,
          'source_rpc', 'fn_verify_actor'
        ),
        v_audit_reason
      );
    END LOOP;
  END IF;

  PERFORM public.fn_audit_log_event(
    'verify',
    'actors',
    p_actor_id,
    p_actor_id,
    p_programme_id,
    jsonb_build_object('event_id', v_event_id, 'decays_at', p_decays_at, 'confidence', p_confidence),
    p_notes
  );

  RETURN v_event_id;
END;
$$;