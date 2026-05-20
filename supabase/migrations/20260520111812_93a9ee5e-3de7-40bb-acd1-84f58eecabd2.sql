BEGIN;

-- Area 1: linked_actor_id column + backfill + tightened constraint + index
ALTER TABLE public.actor_validation_queue
  ADD COLUMN IF NOT EXISTS linked_actor_id uuid REFERENCES public.actors(id);

UPDATE public.actor_validation_queue q
SET linked_actor_id = a.id
FROM public.actors a
WHERE q.origin = 'registry_import'
  AND a.org_number = q.origin_external_id
  AND q.linked_actor_id IS NULL;

ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_registry_origin_required;
ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_origin_links_required;
ALTER TABLE public.actor_validation_queue
  ADD CONSTRAINT actor_validation_queue_origin_links_required
    CHECK (
      (origin = 'user_suggestion' AND user_personal_actor_id IS NOT NULL)
      OR
      (origin = 'registry_import' AND origin_registry IS NOT NULL
                                  AND origin_external_id IS NOT NULL
                                  AND linked_actor_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_actor_validation_queue_linked_actor
  ON public.actor_validation_queue (linked_actor_id)
  WHERE linked_actor_id IS NOT NULL;

-- Area 2: fn_import_actor_from_registry — populate linked_actor_id
CREATE OR REPLACE FUNCTION public.fn_import_actor_from_registry(
  p_registry text,
  p_external_id text,
  p_data jsonb,
  p_evidence_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_actor_id uuid;
  v_queue_id uuid;
  v_existing_actor uuid;
  v_existing_queue uuid;
  v_normalized_external text;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'unauthorized: admin role required';
  END IF;

  IF p_registry NOT IN ('brreg', 'cvr', 'prh') THEN
    RAISE EXCEPTION 'unknown registry: %', p_registry;
  END IF;

  v_normalized_external := NULLIF(trim(coalesce(p_external_id, '')), '');
  IF v_normalized_external IS NULL THEN
    RAISE EXCEPTION 'p_external_id required';
  END IF;

  IF p_data IS NULL OR p_data = '{}'::jsonb THEN
    RAISE EXCEPTION 'p_data required';
  END IF;

  SELECT id INTO v_existing_actor
  FROM public.actors
  WHERE regexp_replace(coalesce(org_number, ''), '\D', '', 'g')
      = regexp_replace(v_normalized_external, '\D', '', 'g')
    AND regexp_replace(v_normalized_external, '\D', '', 'g') <> ''
  LIMIT 1;

  IF v_existing_actor IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate_actor',
      'existing_actor_id', v_existing_actor,
      'message', format('Actor with org_number %s already exists', v_normalized_external)
    );
  END IF;

  SELECT id INTO v_existing_queue
  FROM public.actor_validation_queue
  WHERE origin = 'registry_import'
    AND origin_registry = p_registry
    AND origin_external_id = v_normalized_external
    AND status = 'pending'
  LIMIT 1;

  IF v_existing_queue IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate_queue',
      'existing_queue_id', v_existing_queue,
      'message', 'Already in verification queue'
    );
  END IF;

  INSERT INTO public.actors (
    legal_name, country, org_number,
    street_address, city, region, postal_code,
    websites, trade_names, source, verification_status, verified_at
  )
  VALUES (
    coalesce(NULLIF(trim(coalesce(p_data->>'actor_name', '')), ''), v_normalized_external),
    NULLIF(p_data->>'country', ''),
    v_normalized_external,
    NULLIF(p_data->>'street_address', ''),
    NULLIF(p_data->>'city', ''),
    NULLIF(p_data->>'region', ''),
    NULLIF(p_data->>'postal_code', ''),
    CASE WHEN NULLIF(p_data->>'actor_website', '') IS NOT NULL
         THEN ARRAY[p_data->>'actor_website']
         ELSE ARRAY[]::text[] END,
    CASE WHEN jsonb_typeof(p_data->'trade_names') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'trade_names'))
         ELSE ARRAY[]::text[] END,
    'registry_import', 'unverified', NULL
  )
  RETURNING id INTO v_actor_id;

  INSERT INTO public.actor_validation_queue (
    user_personal_actor_id,
    linked_actor_id,
    suggested_by,
    status,
    origin,
    origin_registry,
    origin_external_id,
    duplicate_check_result
  )
  VALUES (
    NULL,
    v_actor_id,
    v_admin_id,
    'pending',
    'registry_import',
    p_registry,
    v_normalized_external,
    p_data
  )
  RETURNING id INTO v_queue_id;

  PERFORM public.fn_audit_log_event(
    'import_actor_from_registry',
    'actors',
    v_actor_id,
    v_actor_id,
    NULL,
    jsonb_build_object(
      'registry', p_registry,
      'external_id', v_normalized_external,
      'queue_id', v_queue_id,
      'evidence_url', p_evidence_url,
      'data', p_data
    ),
    format('registry_import: %s/%s -> actor %s, queue %s',
           p_registry, v_normalized_external, v_actor_id, v_queue_id)
  );

  RETURN jsonb_build_object(
    'status', 'imported',
    'actor_id', v_actor_id,
    'queue_id', v_queue_id
  );
END;
$$;

-- Area 3: fn_approve_and_verify — branch on origin
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

  SELECT * INTO v_queue
  FROM public.actor_validation_queue WHERE id = p_queue_id;

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
      'queue_origin', v_queue.origin,
      'personal_actor_id', v_queue.user_personal_actor_id,
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
$function$;

COMMIT;