CREATE OR REPLACE FUNCTION public.fn_create_programme(
  p_name        text,
  p_description text DEFAULT NULL,
  p_client_org  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'programme name is required'
      USING ERRCODE = '23502';
  END IF;

  INSERT INTO public.programmes (name, description, client_org, owner_user_id)
  VALUES (
    trim(p_name),
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_client_org), ''),
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_create_programme(text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.whoami_diagnostic();
DROP FUNCTION IF EXISTS public.test_insert_diagnostic();