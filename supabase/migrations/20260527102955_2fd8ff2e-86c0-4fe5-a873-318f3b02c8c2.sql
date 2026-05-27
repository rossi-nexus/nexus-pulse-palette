CREATE OR REPLACE FUNCTION public.fn_delete_archived_actor(
  p_actor_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_actor jsonb;
BEGIN
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT to_jsonb(a) INTO v_actor FROM public.actors a WHERE a.id = p_actor_id;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'actor not found';
  END IF;

  IF v_actor->>'verification_status' IS DISTINCT FROM 'merged_into_other' THEN
    RAISE EXCEPTION 'cannot permanently delete a non-archived actor (status = %)',
      v_actor->>'verification_status';
  END IF;

  PERFORM public.fn_audit_log_event(
    p_event_type := 'actor_permanently_deleted',
    p_target_table := 'actors',
    p_target_record_id := p_actor_id,
    p_actor_id := NULL,
    p_programme_id := NULL,
    p_changes := jsonb_build_object('snapshot', v_actor, 'deleted_by', v_uid),
    p_reason := p_reason
  );

  DELETE FROM public.actors WHERE id = p_actor_id;

  RETURN p_actor_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_delete_archived_actor(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.fn_delete_archived_actor(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_archived_actor(uuid, text) TO authenticated;