-- V3 — User-testing fix batch #2 / Area 1
-- fn_propose_new_entry_for_actor: lets a personal-collection owner propose
-- a brand-new ontology entry AND queue it as an item_addition for a given
-- DB actor in one atomic call. The new entry lands with status='proposed'
-- so admins can later approve/rename/archive it. The queue row references
-- the new entry id so fn_accept_item_addition works unchanged.

CREATE OR REPLACE FUNCTION public.fn_propose_new_entry_for_actor(
  p_db_actor_id uuid,
  p_personal_actor_id uuid,
  p_entry_name text,
  p_category_id uuid,
  p_description text DEFAULT NULL,
  p_evidence text DEFAULT NULL,
  p_confidence text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid;
  v_queue_id uuid;
  v_clean_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_clean_name := NULLIF(trim(p_entry_name), '');
  IF v_clean_name IS NULL THEN
    RAISE EXCEPTION 'entry name required';
  END IF;

  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ontology_categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'valid category required';
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

  -- Reuse an existing entry (any status) with same category + normalized name
  -- so we don't pile duplicates into the proposed bucket.
  SELECT id INTO v_entry_id
    FROM public.ontology_entries
    WHERE category_id = p_category_id
      AND lower(trim(raw_name)) = lower(v_clean_name)
    LIMIT 1;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.ontology_entries (category_id, raw_name, description, status, sort_order)
    VALUES (p_category_id, v_clean_name, NULLIF(trim(p_description), ''), 'proposed', 0)
    RETURNING id INTO v_entry_id;
  END IF;

  INSERT INTO public.actor_validation_queue
    (suggested_by, user_personal_actor_id, linked_actor_id,
     origin, status, proposed_items, admin_notes, created_at)
  VALUES
    (v_uid, p_personal_actor_id, p_db_actor_id,
     'item_addition', 'pending',
     jsonb_build_array(jsonb_build_object(
       'ontology_entry_id', v_entry_id,
       'entry_name', v_clean_name,
       'evidence', NULLIF(trim(p_evidence), ''),
       'confidence', NULLIF(trim(p_confidence), ''),
       'source_url', NULLIF(trim(p_source_url), ''),
       'proposed_new', true
     )),
     p_reason, now())
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
      'ontology_entry_id', v_entry_id,
      'entry_name', v_clean_name,
      'category_id', p_category_id,
      'proposed_new_entry', true
    ),
    p_reason
  );

  RETURN v_queue_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_propose_new_entry_for_actor(uuid, uuid, text, uuid, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_propose_new_entry_for_actor(uuid, uuid, text, uuid, text, text, text, text, text) TO authenticated;