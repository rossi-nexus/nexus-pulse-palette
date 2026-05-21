
BEGIN;

-- =========================================================================
-- A4 Area 5: drop dead tier code (users.access_tier + get_user_tier)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_user_tier(uuid);
ALTER TABLE public.users DROP COLUMN IF EXISTS access_tier;

-- =========================================================================
-- A4 Area 3: consultants can read full validation queue
-- =========================================================================
DROP POLICY IF EXISTS "Consultants read full validation queue" ON public.actor_validation_queue;
CREATE POLICY "Consultants read full validation queue"
  ON public.actor_validation_queue
  FOR SELECT
  TO authenticated
  USING (public.fn_user_has_attr(auth.uid(), 'role', 'consultant'));

-- =========================================================================
-- A4 Area 4: fn_user_has_attr — re-assert expires_at enforcement.
-- (Already present in current definition; reapplying explicitly per A4 spec
--  so the contract is documented in the latest migration.)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_user_has_attr(
  _uid uuid,
  _key text,
  _value text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_attributes ua
    WHERE ua.user_id = _uid
      AND ua.key = _key
      AND (_value IS NULL OR ua.value = _value)
      AND (ua.expires_at IS NULL OR ua.expires_at > now())
  );
$$;

-- =========================================================================
-- A4 Area 8: audit log on every fn_import_actor_from_registry branch
-- (success path already emits; add duplicate_actor + duplicate_queue paths
--  and add `action` discriminator to the success payload.)
-- =========================================================================
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

  -- Duplicate actor?
  SELECT id INTO v_existing_actor
  FROM public.actors
  WHERE regexp_replace(coalesce(org_number, ''), '\D', '', 'g')
      = regexp_replace(v_normalized_external, '\D', '', 'g')
    AND regexp_replace(v_normalized_external, '\D', '', 'g') <> ''
  LIMIT 1;

  IF v_existing_actor IS NOT NULL THEN
    PERFORM public.fn_audit_log_event(
      'import_actor_from_registry',
      'actors',
      v_existing_actor,
      v_existing_actor,
      NULL,
      jsonb_build_object(
        'registry', p_registry,
        'external_id', v_normalized_external,
        'action', 'duplicate_actor'
      ),
      NULL
    );
    RETURN jsonb_build_object(
      'status', 'duplicate_actor',
      'existing_actor_id', v_existing_actor,
      'message', format('Actor with org_number %s already exists', v_normalized_external)
    );
  END IF;

  -- Duplicate queue entry?
  SELECT id INTO v_existing_queue
  FROM public.actor_validation_queue
  WHERE origin = 'registry_import'
    AND origin_registry = p_registry
    AND origin_external_id = v_normalized_external
    AND status = 'pending'
  LIMIT 1;

  IF v_existing_queue IS NOT NULL THEN
    PERFORM public.fn_audit_log_event(
      'import_actor_from_registry',
      'actor_validation_queue',
      v_existing_queue,
      NULL,
      NULL,
      jsonb_build_object(
        'registry', p_registry,
        'external_id', v_normalized_external,
        'action', 'duplicate_queue'
      ),
      NULL
    );
    RETURN jsonb_build_object(
      'status', 'duplicate_queue',
      'existing_queue_id', v_existing_queue,
      'message', 'Already in verification queue'
    );
  END IF;

  -- Create new actor + queue row.
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
    user_personal_actor_id, linked_actor_id, suggested_by, status,
    origin, origin_registry, origin_external_id, duplicate_check_result
  )
  VALUES (
    NULL, v_actor_id, v_admin_id, 'pending',
    'registry_import', p_registry, v_normalized_external, p_data
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
      'action', 'created'
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

REVOKE ALL ON FUNCTION public.fn_import_actor_from_registry(text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_import_actor_from_registry(text, text, jsonb, text) TO authenticated;

COMMIT;
