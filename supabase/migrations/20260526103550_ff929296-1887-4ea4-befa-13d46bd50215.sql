CREATE OR REPLACE FUNCTION public.fn_update_actor(
  p_actor_id uuid,
  p_updates jsonb,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT to_jsonb(a) INTO v_old FROM public.actors a WHERE a.id = p_actor_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'actor not found';
  END IF;

  UPDATE public.actors SET
    legal_name        = COALESCE(p_updates->>'legal_name', legal_name),
    street_address    = COALESCE(p_updates->>'street_address', street_address),
    city              = COALESCE(p_updates->>'city', city),
    region            = COALESCE(p_updates->>'region', region),
    country           = COALESCE(p_updates->>'country', country),
    postal_code       = COALESCE(p_updates->>'postal_code', postal_code),
    org_number        = COALESCE(p_updates->>'org_number', org_number),
    verifier_id       = v_uid,
    verified_at       = now()
  WHERE id = p_actor_id;

  SELECT to_jsonb(a) INTO v_new FROM public.actors a WHERE a.id = p_actor_id;

  PERFORM public.fn_audit_log_event(
    p_event_type       := 'actor_edit',
    p_target_table     := 'actors',
    p_target_record_id := p_actor_id,
    p_actor_id         := p_actor_id,
    p_programme_id     := NULL,
    p_changes          := jsonb_build_object('before', v_old, 'after', v_new, 'editor', v_uid),
    p_reason           := p_reason
  );

  RETURN p_actor_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_update_actor(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_update_actor(uuid, jsonb, text) TO authenticated;