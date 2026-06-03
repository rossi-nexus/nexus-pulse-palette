
CREATE OR REPLACE FUNCTION public.fn_create_actor_hybrid(
  p_country text,
  p_org_number text,
  p_data jsonb,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_actor_id uuid;
  v_existing_actor uuid;
  v_normalized_org text;
  v_source text;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'unauthorized: admin role required';
  END IF;

  IF p_source NOT IN ('registry', 'manual') THEN
    RAISE EXCEPTION 'invalid source: %, must be registry or manual', p_source;
  END IF;
  v_source := CASE WHEN p_source = 'registry' THEN 'registry_import' ELSE 'manual' END;

  IF p_data IS NULL OR p_data = '{}'::jsonb THEN
    RAISE EXCEPTION 'p_data required';
  END IF;

  IF NULLIF(trim(coalesce(p_data->>'legal_name', '')), '') IS NULL THEN
    RAISE EXCEPTION 'legal_name required';
  END IF;

  v_normalized_org := NULLIF(regexp_replace(coalesce(p_org_number, ''), '\D', '', 'g'), '');

  -- Duplicate detection on org number when present.
  IF v_normalized_org IS NOT NULL THEN
    SELECT id INTO v_existing_actor
    FROM public.actors
    WHERE regexp_replace(coalesce(org_number, ''), '\D', '', 'g') = v_normalized_org
    LIMIT 1;

    IF v_existing_actor IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'duplicate_actor',
        'existing_actor_id', v_existing_actor,
        'message', format('Actor with org_number %s already exists', v_normalized_org)
      );
    END IF;
  END IF;

  INSERT INTO public.actors (
    legal_name,
    country,
    org_number,
    street_address, city, region, postal_code,
    websites,
    trade_names,
    source,
    verification_status,
    verified_at,
    verifier_id
  )
  VALUES (
    trim(p_data->>'legal_name'),
    NULLIF(p_country, ''),
    v_normalized_org,
    NULLIF(p_data->>'street_address', ''),
    NULLIF(p_data->>'city', ''),
    NULLIF(p_data->>'region', ''),
    NULLIF(p_data->>'postal_code', ''),
    CASE
      WHEN jsonb_typeof(p_data->'websites') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'websites'))
      WHEN NULLIF(p_data->>'website', '') IS NOT NULL
        THEN ARRAY[p_data->>'website']
      ELSE ARRAY[]::text[]
    END,
    CASE
      WHEN jsonb_typeof(p_data->'trade_names') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'trade_names'))
      ELSE ARRAY[]::text[]
    END,
    v_source,
    'verified',
    now(),
    v_admin_id
  )
  RETURNING id INTO v_actor_id;

  PERFORM public.fn_audit_log_event(
    'create_actor_hybrid',
    'actors',
    v_actor_id,
    v_actor_id,
    NULL,
    jsonb_build_object(
      'source', v_source,
      'country', p_country,
      'org_number', v_normalized_org,
      'data', p_data
    ),
    format('create_actor_hybrid: %s -> actor %s', v_source, v_actor_id)
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'actor_id', v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_actor_hybrid(text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_create_actor_hybrid(text, text, jsonb, text) TO authenticated;
