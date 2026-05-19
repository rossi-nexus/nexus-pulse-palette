CREATE OR REPLACE FUNCTION public.fn_admin_ontology_decision(
  p_entry_id uuid,
  p_action text,
  p_raw_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_target_entry_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_old_status text;
  v_old_category uuid;
  v_changes jsonb;
  v_new_sort_order integer;
  v_effective_category uuid;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT status, category_id INTO v_old_status, v_old_category
    FROM public.ontology_entries WHERE id = p_entry_id;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'entry not found: %', p_entry_id;
  END IF;
  IF v_old_status <> 'proposed' THEN
    RAISE EXCEPTION 'entry not in proposed status (current: %)', v_old_status;
  END IF;

  IF p_action = 'approve' THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_new_sort_order
      FROM public.ontology_entries
      WHERE category_id = v_old_category AND status = 'active';
    UPDATE public.ontology_entries
      SET status = 'active', sort_order = v_new_sort_order
      WHERE id = p_entry_id;
    v_changes := jsonb_build_object(
      'action', 'approve',
      'old_status', 'proposed', 'new_status', 'active',
      'sort_order', v_new_sort_order
    );

  ELSIF p_action = 'reject' THEN
    UPDATE public.ontology_entries SET status = 'archived' WHERE id = p_entry_id;
    v_changes := jsonb_build_object(
      'action', 'reject',
      'old_status', 'proposed', 'new_status', 'archived'
    );

  ELSIF p_action = 'edit' THEN
    v_effective_category := COALESCE(p_category_id, v_old_category);
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_new_sort_order
      FROM public.ontology_entries
      WHERE category_id = v_effective_category AND status = 'active';
    UPDATE public.ontology_entries
      SET raw_name    = COALESCE(NULLIF(trim(p_raw_name), ''), raw_name),
          description = COALESCE(p_description, description),
          category_id = v_effective_category,
          status      = 'active',
          sort_order  = v_new_sort_order
      WHERE id = p_entry_id;
    v_changes := jsonb_build_object(
      'action', 'edit',
      'edits', jsonb_build_object(
        'raw_name', p_raw_name,
        'description', p_description,
        'category_id', p_category_id
      ),
      'old_status', 'proposed', 'new_status', 'active',
      'sort_order', v_new_sort_order
    );

  ELSIF p_action = 'merge' THEN
    IF p_target_entry_id IS NULL THEN
      RAISE EXCEPTION 'merge requires p_target_entry_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.ontology_entries
      WHERE id = p_target_entry_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'merge target must be an active entry';
    END IF;
    UPDATE public.actor_ontology_tags
      SET ontology_entry_id = p_target_entry_id
      WHERE ontology_entry_id = p_entry_id;
    UPDATE public.ontology_entries SET status = 'archived' WHERE id = p_entry_id;
    v_changes := jsonb_build_object(
      'action', 'merge',
      'merged_into', p_target_entry_id,
      'old_status', 'proposed', 'new_status', 'archived'
    );

  ELSE
    RAISE EXCEPTION 'unknown action: %', p_action;
  END IF;

  PERFORM public.fn_audit_log_event(
    'ontology_admin_decision',
    'ontology_entries',
    p_entry_id,
    NULL,
    NULL,
    v_changes,
    p_reason
  );

  RETURN v_changes;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admin_ontology_decision(uuid, text, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_ontology_decision(uuid, text, text, text, uuid, uuid, text) TO authenticated;

-- Enable pg_trgm for fuzzy duplicate matching (used by the admin queue).
CREATE EXTENSION IF NOT EXISTS pg_trgm;