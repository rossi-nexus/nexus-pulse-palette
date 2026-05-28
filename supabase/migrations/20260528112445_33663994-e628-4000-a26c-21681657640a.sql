
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE OR REPLACE FUNCTION public.fn_admin_set_user_attribute(
  p_user_id uuid,
  p_key text,
  p_value text,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  INSERT INTO public.user_attributes (user_id, key, value, granted_by, expires_at)
  VALUES (p_user_id, p_key, p_value, auth.uid(), p_expires_at)
  ON CONFLICT (user_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        expires_at = EXCLUDED.expires_at,
        granted_by = EXCLUDED.granted_by,
        granted_at = now();

  PERFORM public.fn_audit_log_event(
    'admin_user_attribute_set',
    'user_attributes',
    p_user_id,
    NULL, NULL,
    jsonb_build_object('key', p_key, 'value', p_value, 'expires_at', p_expires_at),
    NULL
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_admin_set_user_attribute(uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_set_user_attribute(uuid, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_admin_remove_user_attribute(
  p_user_id uuid,
  p_key text,
  p_value text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  DELETE FROM public.user_attributes
  WHERE user_id = p_user_id
    AND key = p_key
    AND (p_value IS NULL OR value IS NOT DISTINCT FROM p_value);

  PERFORM public.fn_audit_log_event(
    'admin_user_attribute_removed',
    'user_attributes',
    p_user_id,
    NULL, NULL,
    jsonb_build_object('key', p_key, 'value', p_value),
    NULL
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_admin_remove_user_attribute(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_remove_user_attribute(uuid, text, text) TO authenticated;

-- Admin list view: aggregate users with attributes + programme counts
CREATE OR REPLACE FUNCTION public.fn_admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  deactivated_at timestamptz,
  created_at timestamptz,
  attributes jsonb,
  programmes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    u.id, u.email, u.name, u.role, u.deactivated_at, u.created_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', a.key, 'value', a.value, 'expires_at', a.expires_at))
      FROM public.user_attributes a WHERE a.user_id = u.id
    ), '[]'::jsonb) AS attributes,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('programme_id', pm.programme_id, 'name', p.name, 'role', pm.role))
      FROM public.programme_members pm
      JOIN public.programmes p ON p.id = pm.programme_id
      WHERE pm.user_id = u.id
    ), '[]'::jsonb) AS programmes
  FROM public.users u
  ORDER BY u.created_at DESC;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_admin_deactivate_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.users SET deactivated_at = now() WHERE id = p_user_id;

  PERFORM public.fn_audit_log_event(
    'admin_user_deactivated',
    'users',
    p_user_id,
    NULL, NULL, NULL, NULL
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_admin_deactivate_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_deactivate_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_admin_update_user(
  p_user_id uuid,
  p_name text,
  p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.users
  SET name = COALESCE(p_name, name),
      role = COALESCE(p_role, role),
      updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.fn_audit_log_event(
    'admin_user_edited',
    'users',
    p_user_id,
    NULL, NULL,
    jsonb_build_object('name', p_name, 'role', p_role),
    NULL
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_admin_update_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_update_user(uuid, text, text) TO authenticated;
