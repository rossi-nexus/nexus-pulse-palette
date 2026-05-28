-- Fix: verification RPCs now also persist per-item descriptions into actor_descriptions
-- (mirrors the evidence/confidence/source_url pattern already in place).
--
-- Mapping ontology_categories.type -> actor_descriptions.type:
--   capability     -> capability
--   competence     -> competence
--   domain         -> domain
--   product_type   -> product
--   service_type   -> service
--
-- For re-verify paths (fn_approve_and_verify, fn_verify_actor) we DELETE prior
-- consultant_completion descriptions (scoped to the 5 non-summary types) before
-- the decision loop, then INSERT fresh from the current decision set. Manually
-- added summary rows are untouched.

-- Helper: resolve actor_descriptions.type from a decision (returns NULL if unresolvable).
CREATE OR REPLACE FUNCTION public.fn_resolve_description_type(
  p_proposed_category_id uuid,
  p_mapped_entry_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_type text;
BEGIN
  IF p_proposed_category_id IS NOT NULL THEN
    SELECT type INTO v_cat_type FROM public.ontology_categories WHERE id = p_proposed_category_id;
  ELSIF p_mapped_entry_id IS NOT NULL THEN
    SELECT c.type INTO v_cat_type
    FROM public.ontology_entries e
    JOIN public.ontology_categories c ON c.id = e.category_id
    WHERE e.id = p_mapped_entry_id;
  END IF;

  RETURN CASE v_cat_type
    WHEN 'capability'   THEN 'capability'
    WHEN 'competence'   THEN 'competence'
    WHEN 'domain'       THEN 'domain'
    WHEN 'product_type' THEN 'product'
    WHEN 'service_type' THEN 'service'
    ELSE NULL
  END;
END;
$$;

-- ============================================================================
-- 1) fn_onboard_verified_actor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_onboard_verified_actor(
  p_identity jsonb,
  p_ontology_items jsonb,
  p_verification jsonb,
  p_programme_id uuid,
  p_consultant_decisions jsonb DEFAULT NULL::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_actor_id        uuid;
  v_legal_name      text;
  v_authorised      boolean;
  v_item            jsonb;
  v_entry_id        uuid;
  v_entry_name      text;
  v_matched         int := 0;
  v_unmatched       text[] := ARRAY[]::text[];
  v_event_id        uuid;
  v_decays_at       timestamptz;
  v_confidence      text;
  v_decision        jsonb;
  v_action          text;
  v_proposed_name   text;
  v_proposed_cat    uuid;
  v_mapped_entry    uuid;
  v_new_entry_id    uuid;
  v_proposed_desc   text;
  v_decision_count  int := 0;
  v_new_entry_count int := 0;
  v_mapped_count    int := 0;
  v_audit_reason    text;
  v_evidence        text;
  v_d_conf          text;
  v_source_url      text;
  v_tag_source      text;
  v_tag_inserted    boolean;
  v_tags_written    int := 0;
  v_with_evidence   int := 0;
  v_with_confidence int := 0;
  v_with_source     int := 0;
  v_desc_text       text;
  v_desc_type       text;
  v_descriptions_written int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorised — no auth.uid()' USING ERRCODE = '42501';
  END IF;

  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(v_uid) OR EXISTS (
      SELECT 1 FROM public.user_attributes
      WHERE user_id = v_uid AND key = 'role' AND value = 'consultant'
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_authorised;
  ELSE
    SELECT public.is_admin(v_uid) OR EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = v_uid
        AND pm.role IN ('owner', 'consultant')
    ) INTO v_authorised;
  END IF;

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'unauthorised — caller lacks consultant role or programme authority'
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
      v_evidence   := NULLIF(trim(v_item->>'evidence'), '');
      v_d_conf     := NULLIF(trim(v_item->>'confidence'), '');
      v_source_url := NULLIF(trim(v_item->>'source_url'), '');
      v_tag_source := COALESCE(NULLIF(trim(v_item->>'source'), ''), 'consultant_completion');

      SELECT id INTO v_entry_id
      FROM public.ontology_entries
      WHERE lower(raw_name) = lower(v_entry_name)
        AND status = 'active'
      LIMIT 1;

      IF v_entry_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.actor_ontology_tags
          WHERE actor_id = v_actor_id AND ontology_entry_id = v_entry_id
        ) THEN
          INSERT INTO public.actor_ontology_tags
            (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
          VALUES
            (v_actor_id, v_entry_id, v_tag_source, v_evidence, v_d_conf, v_source_url, now());
          v_tags_written := v_tags_written + 1;
          IF v_evidence IS NOT NULL THEN v_with_evidence := v_with_evidence + 1; END IF;
          IF v_d_conf IS NOT NULL THEN v_with_confidence := v_with_confidence + 1; END IF;
          IF v_source_url IS NOT NULL THEN v_with_source := v_with_source + 1; END IF;
        END IF;
        v_matched := v_matched + 1;

        -- NEW: per-item description for legacy ontology-items payload
        v_desc_text := NULLIF(trim(v_item->>'description'), '');
        IF v_desc_text IS NOT NULL THEN
          v_desc_type := public.fn_resolve_description_type(NULL, v_entry_id);
          IF v_desc_type IS NOT NULL THEN
            INSERT INTO public.actor_descriptions (actor_id, type, content, source)
            VALUES (v_actor_id, v_desc_type, v_desc_text, 'consultant_completion');
            v_descriptions_written := v_descriptions_written + 1;
          END IF;
        END IF;
      ELSE
        v_unmatched := array_append(v_unmatched, v_entry_name);
      END IF;
    END LOOP;
  END IF;

  IF p_consultant_decisions IS NOT NULL
     AND jsonb_typeof(p_consultant_decisions) = 'array'
     AND jsonb_array_length(p_consultant_decisions) > 0 THEN
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_consultant_decisions) LOOP
      v_action        := v_decision->>'action';
      v_proposed_name := NULLIF(trim(v_decision->>'proposed_name'), '');
      v_proposed_cat  := NULLIF(v_decision->>'proposed_category_id', '')::uuid;
      v_mapped_entry  := NULLIF(v_decision->>'mapped_to_entry_id', '')::uuid;
      v_proposed_desc := NULLIF(trim(v_decision->>'proposed_description'), '');
      v_evidence      := NULLIF(trim(v_decision->>'evidence'), '');
      v_d_conf        := NULLIF(trim(v_decision->>'confidence'), '');
      v_source_url    := NULLIF(trim(v_decision->>'source_url'), '');
      v_tag_source    := COALESCE(NULLIF(trim(v_decision->>'source'), ''), 'consultant_completion');
      v_desc_text     := NULLIF(trim(v_decision->>'description'), '');
      v_new_entry_id  := NULL;
      v_tag_inserted  := false;
      v_decision_count := v_decision_count + 1;

      IF v_action = 'map-to-existing' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = v_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags
              (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
            VALUES
              (v_actor_id, v_mapped_entry, v_tag_source, v_evidence, v_d_conf, v_source_url, now());
            v_tag_inserted := true;
          END IF;
          v_mapped_count := v_mapped_count + 1;
        END IF;
        v_audit_reason := format('map-to-existing: %L -> entry %s', v_proposed_name, v_mapped_entry);

      ELSIF v_action = 'accept-as-new' THEN
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;

          INSERT INTO public.actor_ontology_tags
            (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
          VALUES
            (v_actor_id, v_new_entry_id, v_tag_source, v_evidence, v_d_conf, v_source_url, now());
          v_tag_inserted := true;
          v_new_entry_count := v_new_entry_count + 1;
        END IF;
        v_audit_reason := format('accept-as-new: %L -> proposed entry %s', v_proposed_name, v_new_entry_id);

      ELSIF v_action = 'map-and-propose' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = v_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags
              (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
            VALUES
              (v_actor_id, v_mapped_entry, v_tag_source, v_evidence, v_d_conf, v_source_url, now());
            v_tag_inserted := true;
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

      IF v_tag_inserted THEN
        v_tags_written := v_tags_written + 1;
        IF v_evidence IS NOT NULL THEN v_with_evidence := v_with_evidence + 1; END IF;
        IF v_d_conf IS NOT NULL THEN v_with_confidence := v_with_confidence + 1; END IF;
        IF v_source_url IS NOT NULL THEN v_with_source := v_with_source + 1; END IF;
      END IF;

      -- NEW: persist per-item description (capability / product / service prose)
      IF v_action IN ('map-to-existing','accept-as-new','map-and-propose')
         AND v_desc_text IS NOT NULL THEN
        v_desc_type := public.fn_resolve_description_type(
          v_proposed_cat,
          COALESCE(v_mapped_entry, v_new_entry_id)
        );
        IF v_desc_type IS NOT NULL THEN
          INSERT INTO public.actor_descriptions (actor_id, type, content, source)
          VALUES (v_actor_id, v_desc_type, v_desc_text, 'consultant_completion');
          v_descriptions_written := v_descriptions_written + 1;
        END IF;
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
          'description_present', (v_desc_text IS NOT NULL),
          'evidence_present', (v_evidence IS NOT NULL),
          'confidence', v_d_conf,
          'source_url_present', (v_source_url IS NOT NULL),
          'programme_id', p_programme_id,
          'source_rpc', 'fn_onboard_verified_actor'
        ),
        v_audit_reason
      );
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
      'ontology_unmatched', to_jsonb(v_unmatched),
      'consultant_decision_count', v_decision_count,
      'consultant_new_entry_count', v_new_entry_count,
      'consultant_mapped_count', v_mapped_count,
      'tags_written', v_tags_written,
      'with_evidence', v_with_evidence,
      'with_confidence', v_with_confidence,
      'with_source', v_with_source,
      'descriptions_written', v_descriptions_written,
      'programme_assigned', (p_programme_id IS NOT NULL)
    ),
    NULLIF(p_verification->>'notes', '')
  );

  RETURN jsonb_build_object(
    'actor_id', v_actor_id,
    'verification_event_id', v_event_id,
    'ontology_matched_count', v_matched,
    'ontology_unmatched', to_jsonb(v_unmatched),
    'consultant_decision_count', v_decision_count,
    'consultant_new_entry_count', v_new_entry_count,
    'consultant_mapped_count', v_mapped_count,
    'tags_written', v_tags_written,
    'with_evidence', v_with_evidence,
    'with_confidence', v_with_confidence,
    'with_source', v_with_source,
    'descriptions_written', v_descriptions_written,
    'programme_assigned', (p_programme_id IS NOT NULL)
  );
END;
$function$;

-- ============================================================================
-- 2) fn_approve_and_verify (7-arg overload)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_approve_and_verify(
  p_queue_id uuid,
  p_evidence jsonb,
  p_decays_at timestamp with time zone,
  p_confidence text,
  p_notes text,
  p_programme_id uuid DEFAULT NULL::uuid,
  p_consultant_decisions jsonb DEFAULT '[]'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue record;
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
  v_evidence text;
  v_d_conf text;
  v_source_url text;
  v_tag_inserted boolean;
  v_tags_written int := 0;
  v_with_evidence int := 0;
  v_with_confidence int := 0;
  v_with_source int := 0;
  v_desc_text text;
  v_desc_type text;
  v_descriptions_written int := 0;
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

  SELECT * INTO v_queue FROM public.actor_validation_queue WHERE id = p_queue_id;
  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'queue_row_not_found' USING HINT = 'Invalid queue id.';
  END IF;

  IF v_queue.origin = 'user_suggestion' THEN
    SELECT * INTO v_personal_actor
    FROM public.user_personal_actors
    WHERE id = v_queue.user_personal_actor_id;

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
  ELSIF v_queue.origin = 'registry_import' THEN
    v_actor_id := v_queue.linked_actor_id;
    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'registry-origin queue row % has NULL linked_actor_id', v_queue.id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.actors WHERE id = v_actor_id) THEN
      RAISE EXCEPTION 'linked_actor_id % no longer exists', v_actor_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown queue origin: %', v_queue.origin;
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

  IF v_queue.origin = 'user_suggestion' THEN
    UPDATE public.user_personal_actors
    SET status = 'merged',
        matched_main_db_actor_id = v_actor_id,
        match_timestamp = now()
    WHERE id = v_queue.user_personal_actor_id;
  END IF;

  -- NEW: wipe prior consultant_completion descriptions on re-verify; keep summaries + other sources.
  DELETE FROM public.actor_descriptions
   WHERE actor_id = v_actor_id
     AND source = 'consultant_completion'
     AND type IN ('capability','competence','domain','product','service');

  IF p_consultant_decisions IS NOT NULL
     AND jsonb_typeof(p_consultant_decisions) = 'array'
     AND jsonb_array_length(p_consultant_decisions) > 0 THEN
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_consultant_decisions) LOOP
      v_action        := v_decision->>'action';
      v_proposed_name := NULLIF(trim(v_decision->>'proposed_name'), '');
      v_proposed_cat  := NULLIF(v_decision->>'proposed_category_id', '')::uuid;
      v_mapped_entry  := NULLIF(v_decision->>'mapped_to_entry_id', '')::uuid;
      v_proposed_desc := NULLIF(trim(v_decision->>'proposed_description'), '');
      v_evidence      := NULLIF(trim(v_decision->>'evidence'), '');
      v_d_conf        := NULLIF(trim(v_decision->>'confidence'), '');
      v_source_url    := NULLIF(trim(v_decision->>'source_url'), '');
      v_desc_text     := NULLIF(trim(v_decision->>'description'), '');
      v_new_entry_id  := NULL;
      v_tag_inserted  := false;
      v_decision_count := v_decision_count + 1;

      IF v_action = 'map-to-existing' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = v_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags
              (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
            VALUES
              (v_actor_id, v_mapped_entry, 'consultant_completion', v_evidence, v_d_conf, v_source_url, now());
            v_tag_inserted := true;
          END IF;
          v_mapped_count := v_mapped_count + 1;
        END IF;
        v_audit_reason := format('map-to-existing: %L -> entry %s', v_proposed_name, v_mapped_entry);

      ELSIF v_action = 'accept-as-new' THEN
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;

          INSERT INTO public.actor_ontology_tags
            (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
          VALUES
            (v_actor_id, v_new_entry_id, 'consultant_completion', v_evidence, v_d_conf, v_source_url, now());
          v_tag_inserted := true;
          v_new_entry_count := v_new_entry_count + 1;
        END IF;
        v_audit_reason := format('accept-as-new: %L -> proposed entry %s', v_proposed_name, v_new_entry_id);

      ELSIF v_action = 'map-and-propose' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = v_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags
              (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
            VALUES
              (v_actor_id, v_mapped_entry, 'consultant_completion', v_evidence, v_d_conf, v_source_url, now());
            v_tag_inserted := true;
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

      IF v_tag_inserted THEN
        v_tags_written := v_tags_written + 1;
        IF v_evidence IS NOT NULL THEN v_with_evidence := v_with_evidence + 1; END IF;
        IF v_d_conf IS NOT NULL THEN v_with_confidence := v_with_confidence + 1; END IF;
        IF v_source_url IS NOT NULL THEN v_with_source := v_with_source + 1; END IF;
      END IF;

      -- NEW: per-item description write
      IF v_action IN ('map-to-existing','accept-as-new','map-and-propose')
         AND v_desc_text IS NOT NULL THEN
        v_desc_type := public.fn_resolve_description_type(
          v_proposed_cat,
          COALESCE(v_mapped_entry, v_new_entry_id)
        );
        IF v_desc_type IS NOT NULL THEN
          INSERT INTO public.actor_descriptions (actor_id, type, content, source)
          VALUES (v_actor_id, v_desc_type, v_desc_text, 'consultant_completion');
          v_descriptions_written := v_descriptions_written + 1;
        END IF;
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
          'description_present', (v_desc_text IS NOT NULL),
          'evidence_present', (v_evidence IS NOT NULL),
          'confidence', v_d_conf,
          'source_url_present', (v_source_url IS NOT NULL),
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
      'queue_origin', v_queue.origin,
      'personal_actor_id', v_queue.user_personal_actor_id,
      'decays_at', p_decays_at,
      'confidence', p_confidence,
      'consultant_decision_count', v_decision_count,
      'consultant_new_entry_count', v_new_entry_count,
      'consultant_mapped_count', v_mapped_count,
      'tags_written', v_tags_written,
      'with_evidence', v_with_evidence,
      'with_confidence', v_with_confidence,
      'with_source', v_with_source,
      'descriptions_written', v_descriptions_written
    ),
    p_notes
  );

  RETURN jsonb_build_object(
    'actor_id', v_actor_id,
    'event_id', v_event_id,
    'consultant_decision_count', v_decision_count,
    'consultant_new_entry_count', v_new_entry_count,
    'consultant_mapped_count', v_mapped_count,
    'tags_written', v_tags_written,
    'with_evidence', v_with_evidence,
    'with_confidence', v_with_confidence,
    'with_source', v_with_source,
    'descriptions_written', v_descriptions_written
  );
END;
$function$;

-- ============================================================================
-- 3) fn_verify_actor (7-arg overload)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_verify_actor(
  p_actor_id uuid,
  p_evidence jsonb,
  p_decays_at timestamp with time zone,
  p_confidence text,
  p_notes text,
  p_programme_id uuid DEFAULT NULL::uuid,
  p_consultant_decisions jsonb DEFAULT '[]'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_evidence text;
  v_d_conf text;
  v_source_url text;
  v_tag_inserted boolean;
  v_tags_written int := 0;
  v_with_evidence int := 0;
  v_with_confidence int := 0;
  v_with_source int := 0;
  v_desc_text text;
  v_desc_type text;
  v_descriptions_written int := 0;
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

  -- NEW: wipe prior consultant_completion descriptions on re-verify; keep summaries + other sources.
  DELETE FROM public.actor_descriptions
   WHERE actor_id = p_actor_id
     AND source = 'consultant_completion'
     AND type IN ('capability','competence','domain','product','service');

  IF p_consultant_decisions IS NOT NULL
     AND jsonb_typeof(p_consultant_decisions) = 'array'
     AND jsonb_array_length(p_consultant_decisions) > 0 THEN
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_consultant_decisions) LOOP
      v_action        := v_decision->>'action';
      v_proposed_name := NULLIF(trim(v_decision->>'proposed_name'), '');
      v_proposed_cat  := NULLIF(v_decision->>'proposed_category_id', '')::uuid;
      v_mapped_entry  := NULLIF(v_decision->>'mapped_to_entry_id', '')::uuid;
      v_proposed_desc := NULLIF(trim(v_decision->>'proposed_description'), '');
      v_evidence      := NULLIF(trim(v_decision->>'evidence'), '');
      v_d_conf        := NULLIF(trim(v_decision->>'confidence'), '');
      v_source_url    := NULLIF(trim(v_decision->>'source_url'), '');
      v_desc_text     := NULLIF(trim(v_decision->>'description'), '');
      v_new_entry_id  := NULL;
      v_tag_inserted  := false;

      IF v_action = 'map-to-existing' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = p_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags
              (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
            VALUES
              (p_actor_id, v_mapped_entry, 'consultant_completion', v_evidence, v_d_conf, v_source_url, now());
            v_tag_inserted := true;
          END IF;
        END IF;
        v_audit_reason := format('map-to-existing: %L -> entry %s', v_proposed_name, v_mapped_entry);

      ELSIF v_action = 'accept-as-new' THEN
        IF v_proposed_name IS NOT NULL AND v_proposed_cat IS NOT NULL THEN
          INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
          VALUES (v_proposed_cat, v_proposed_name, v_proposed_desc, 'proposed', 0)
          RETURNING id INTO v_new_entry_id;
          INSERT INTO public.actor_ontology_tags
            (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
          VALUES
            (p_actor_id, v_new_entry_id, 'consultant_completion', v_evidence, v_d_conf, v_source_url, now());
          v_tag_inserted := true;
        END IF;
        v_audit_reason := format('accept-as-new: %L -> proposed entry %s', v_proposed_name, v_new_entry_id);

      ELSIF v_action = 'map-and-propose' THEN
        IF v_mapped_entry IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.actor_ontology_tags
            WHERE actor_id = p_actor_id AND ontology_entry_id = v_mapped_entry
          ) THEN
            INSERT INTO public.actor_ontology_tags
              (actor_id, ontology_entry_id, source, evidence, confidence, source_url, accepted_at)
            VALUES
              (p_actor_id, v_mapped_entry, 'consultant_completion', v_evidence, v_d_conf, v_source_url, now());
            v_tag_inserted := true;
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

      IF v_tag_inserted THEN
        v_tags_written := v_tags_written + 1;
        IF v_evidence IS NOT NULL THEN v_with_evidence := v_with_evidence + 1; END IF;
        IF v_d_conf IS NOT NULL THEN v_with_confidence := v_with_confidence + 1; END IF;
        IF v_source_url IS NOT NULL THEN v_with_source := v_with_source + 1; END IF;
      END IF;

      -- NEW: per-item description write
      IF v_action IN ('map-to-existing','accept-as-new','map-and-propose')
         AND v_desc_text IS NOT NULL THEN
        v_desc_type := public.fn_resolve_description_type(
          v_proposed_cat,
          COALESCE(v_mapped_entry, v_new_entry_id)
        );
        IF v_desc_type IS NOT NULL THEN
          INSERT INTO public.actor_descriptions (actor_id, type, content, source)
          VALUES (p_actor_id, v_desc_type, v_desc_text, 'consultant_completion');
          v_descriptions_written := v_descriptions_written + 1;
        END IF;
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
          'description_present', (v_desc_text IS NOT NULL),
          'evidence_present', (v_evidence IS NOT NULL),
          'confidence', v_d_conf,
          'source_url_present', (v_source_url IS NOT NULL),
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
    jsonb_build_object(
      'event_id', v_event_id,
      'decays_at', p_decays_at,
      'confidence', p_confidence,
      'tags_written', v_tags_written,
      'with_evidence', v_with_evidence,
      'with_confidence', v_with_confidence,
      'with_source', v_with_source,
      'descriptions_written', v_descriptions_written
    ),
    p_notes
  );

  RETURN v_event_id;
END;
$function$;