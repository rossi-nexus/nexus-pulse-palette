
-- Phase 6.5.5b fix (52c) — relax actors_source_check + revert-to-editable on reject

-- 1. Relax actors_source_check to allow 'consultant_approval'
ALTER TABLE public.actors DROP CONSTRAINT actors_source_check;
ALTER TABLE public.actors ADD CONSTRAINT actors_source_check
  CHECK (source IN ('search', 'manual', 'url_import', 'file_import', 'batch_import', 'api_connector', 'consultant_approval'));

-- 2. Update fn_reject_suggestion: revert personal actor to 'personal' (editable) instead of 'rejected'
CREATE OR REPLACE FUNCTION public.fn_reject_suggestion(p_queue_id uuid, p_reason text DEFAULT NULL::text, p_programme_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_personal_actor_id uuid;
  v_caller_can_act boolean;
BEGIN
  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(auth.uid()) INTO v_caller_can_act;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','consultant')
    ) OR public.is_admin(auth.uid()) INTO v_caller_can_act;
  END IF;

  IF NOT v_caller_can_act THEN
    RAISE EXCEPTION 'rejection_permission_denied';
  END IF;

  SELECT user_personal_actor_id INTO v_personal_actor_id
  FROM public.actor_validation_queue WHERE id = p_queue_id;

  IF v_personal_actor_id IS NULL THEN
    RAISE EXCEPTION 'queue_row_not_found';
  END IF;

  UPDATE public.actor_validation_queue
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = COALESCE(p_reason, admin_notes)
  WHERE id = p_queue_id;

  -- Revert personal actor to editable so user can address feedback and re-submit
  UPDATE public.user_personal_actors
  SET status = 'personal',
      suggested_at = NULL
  WHERE id = v_personal_actor_id;

  PERFORM public.fn_audit_log_event(
    'reject_suggestion',
    'actor_validation_queue',
    p_queue_id,
    NULL,
    p_programme_id,
    jsonb_build_object(
      'personal_actor_id', v_personal_actor_id,
      'personal_actor_status_change', 'suggested → personal',
      'queue_status_change', 'pending → rejected'
    ),
    p_reason
  );

  RETURN p_queue_id;
END;
$function$;
