
-- ============================================================
-- Profile Smart Merge — item_addition queue origin + RPCs
-- ============================================================

-- 1. Extend origin CHECK to include item_addition
ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_origin_check;
ALTER TABLE public.actor_validation_queue
  ADD CONSTRAINT actor_validation_queue_origin_check
  CHECK (origin IN ('user_suggestion', 'registry_import', 'item_addition'));

-- 2. Update the link-required CHECK so item_addition rows must carry
--    both linked_actor_id (target DB actor) and user_personal_actor_id
--    (proposer's personal row).
ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_origin_links_required;
ALTER TABLE public.actor_validation_queue
  ADD CONSTRAINT actor_validation_queue_origin_links_required CHECK (
    (origin = 'user_suggestion' AND user_personal_actor_id IS NOT NULL)
    OR (origin = 'registry_import'
        AND origin_registry IS NOT NULL
        AND origin_external_id IS NOT NULL
        AND linked_actor_id IS NOT NULL)
    OR (origin = 'item_addition'
        AND linked_actor_id IS NOT NULL
        AND user_personal_actor_id IS NOT NULL)
  );

-- 3. New column for the proposed items payload
ALTER TABLE public.actor_validation_queue
  ADD COLUMN IF NOT EXISTS proposed_items jsonb;

-- 4. Index for queue listing by origin+status
CREATE INDEX IF NOT EXISTS idx_actor_validation_queue_origin_status
  ON public.actor_validation_queue (origin, status);

-- 5. Extend actor_ontology_tags.source CHECK to allow 'item_addition'
ALTER TABLE public.actor_ontology_tags
  DROP CONSTRAINT IF EXISTS actor_ontology_tags_source_check;
ALTER TABLE public.actor_ontology_tags
  ADD CONSTRAINT actor_ontology_tags_source_check
  CHECK (source = ANY (ARRAY[
    'search', 'manual', 'api_connector',
    'consultant_completion', 'item_addition'
  ]));

-- ============================================================
-- fn_propose_items_for_actor: personal-collection owner proposes
-- new ontology tags for the matched verified DB actor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_propose_items_for_actor(
  p_db_actor_id uuid,
  p_personal_actor_id uuid,
  p_items jsonb,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_queue_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_personal_actors
    WHERE id = p_personal_actor_id
      AND (user_id = v_uid OR public.is_admin(v_uid))
  ) THEN
    RAISE EXCEPTION 'personal actor not owned by caller';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.actors WHERE id = p_db_actor_id) THEN
    RAISE EXCEPTION 'target DB actor not found';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSONB array';
  END IF;

  INSERT INTO public.actor_validation_queue
    (suggested_by, user_personal_actor_id, linked_actor_id,
     origin, status, proposed_items, admin_notes, created_at)
  VALUES
    (v_uid, p_personal_actor_id, p_db_actor_id,
     'item_addition', 'pending', p_items, p_reason, now())
  RETURNING id INTO v_queue_id;

  PERFORM public.fn_audit_log_event(
    'item_addition_proposed',
    'actor_validation_queue',
    v_queue_id,
    p_db_actor_id,
    NULL,
    jsonb_build_object(
      'proposer', v_uid,
      'personal_actor_id', p_personal_actor_id,
      'item_count', jsonb_array_length(p_items),
      'items', p_items
    ),
    p_reason
  );

  RETURN v_queue_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_propose_items_for_actor(uuid, uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_propose_items_for_actor(uuid, uuid, jsonb, text) TO authenticated;

-- ============================================================
-- fn_accept_item_addition: consultant/admin accepts items;
-- inserts into actor_ontology_tags for the target DB actor.
-- Does NOT bump actors.verified_at.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_accept_item_addition(
  p_queue_id uuid,
  p_accepted_items jsonb,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_queue record;
  v_item jsonb;
  v_added_count int := 0;
  v_target_actor_id uuid;
  v_entry_id uuid;
BEGIN
  IF NOT public.is_admin(v_uid) AND NOT public.fn_user_has_attr(v_uid, 'role', 'consultant') THEN
    RAISE EXCEPTION 'consultant or admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_queue FROM public.actor_validation_queue WHERE id = p_queue_id;
  IF v_queue IS NULL THEN
    RAISE EXCEPTION 'queue row not found';
  END IF;
  IF v_queue.origin <> 'item_addition' THEN
    RAISE EXCEPTION 'queue row is not an item_addition (origin = %)', v_queue.origin;
  END IF;
  IF v_queue.linked_actor_id IS NULL THEN
    RAISE EXCEPTION 'queue row missing target DB actor (linked_actor_id)';
  END IF;
  IF v_queue.status <> 'pending' THEN
    RAISE EXCEPTION 'queue row not pending (status = %)', v_queue.status;
  END IF;
  IF p_accepted_items IS NULL OR jsonb_typeof(p_accepted_items) <> 'array' THEN
    RAISE EXCEPTION 'p_accepted_items must be a JSONB array';
  END IF;

  v_target_actor_id := v_queue.linked_actor_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_accepted_items) LOOP
    IF v_item->>'ontology_entry_id' IS NULL THEN
      CONTINUE;
    END IF;
    v_entry_id := (v_item->>'ontology_entry_id')::uuid;

    -- Dedupe: skip if this actor already has this ontology entry.
    IF EXISTS (
      SELECT 1 FROM public.actor_ontology_tags
      WHERE actor_id = v_target_actor_id
        AND ontology_entry_id = v_entry_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.actor_ontology_tags
      (actor_id, ontology_entry_id, source,
       evidence, confidence, source_url, accepted_at)
    VALUES
      (v_target_actor_id,
       v_entry_id,
       'item_addition',
       NULLIF(trim(v_item->>'evidence'), ''),
       NULLIF(trim(v_item->>'confidence'), ''),
       NULLIF(trim(v_item->>'source_url'), ''),
       now());

    v_added_count := v_added_count + 1;
  END LOOP;

  UPDATE public.actor_validation_queue
    SET status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_uid,
        admin_notes = COALESCE(p_reason, admin_notes)
    WHERE id = p_queue_id;

  PERFORM public.fn_audit_log_event(
    'item_addition_accepted',
    'actors',
    v_target_actor_id,
    v_target_actor_id,
    NULL,
    jsonb_build_object(
      'queue_id', p_queue_id,
      'accepted_items', p_accepted_items,
      'item_count', jsonb_array_length(p_accepted_items),
      'added_count', v_added_count,
      'verifier', v_uid
    ),
    p_reason
  );

  RETURN v_target_actor_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_accept_item_addition(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_accept_item_addition(uuid, jsonb, text) TO authenticated;

-- ============================================================
-- fn_reject_item_addition: consultant/admin rejects an item_addition queue row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_reject_item_addition(
  p_queue_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_queue record;
BEGIN
  IF NOT public.is_admin(v_uid) AND NOT public.fn_user_has_attr(v_uid, 'role', 'consultant') THEN
    RAISE EXCEPTION 'consultant or admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_queue FROM public.actor_validation_queue WHERE id = p_queue_id;
  IF v_queue IS NULL THEN
    RAISE EXCEPTION 'queue row not found';
  END IF;
  IF v_queue.origin <> 'item_addition' THEN
    RAISE EXCEPTION 'queue row is not an item_addition (origin = %)', v_queue.origin;
  END IF;
  IF v_queue.status <> 'pending' THEN
    RAISE EXCEPTION 'queue row not pending (status = %)', v_queue.status;
  END IF;

  UPDATE public.actor_validation_queue
    SET status = 'rejected',
        reviewed_at = now(),
        reviewed_by = v_uid,
        admin_notes = COALESCE(p_reason, admin_notes)
    WHERE id = p_queue_id;

  PERFORM public.fn_audit_log_event(
    'item_addition_rejected',
    'actor_validation_queue',
    p_queue_id,
    v_queue.linked_actor_id,
    NULL,
    jsonb_build_object(
      'queue_id', p_queue_id,
      'rejected_by', v_uid,
      'item_count', COALESCE(jsonb_array_length(v_queue.proposed_items), 0)
    ),
    p_reason
  );

  RETURN p_queue_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_reject_item_addition(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_reject_item_addition(uuid, text) TO authenticated;
