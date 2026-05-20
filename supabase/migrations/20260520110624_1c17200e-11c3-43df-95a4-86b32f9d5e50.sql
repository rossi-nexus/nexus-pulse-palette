BEGIN;

-- 1. actors_source_check — extend
ALTER TABLE public.actors DROP CONSTRAINT IF EXISTS actors_source_check;
ALTER TABLE public.actors ADD CONSTRAINT actors_source_check
  CHECK (source = ANY (ARRAY[
    'search', 'manual', 'url_import', 'file_import',
    'batch_import', 'api_connector',
    'consultant_approval', 'consultant_onboarding',
    'registry_import'
  ]));

-- 2. actors.postal_code (registries return postal codes; no existing column)
ALTER TABLE public.actors ADD COLUMN IF NOT EXISTS postal_code text;

-- 3. actor_validation_queue — loosen FK + add origin columns
ALTER TABLE public.actor_validation_queue
  ALTER COLUMN user_personal_actor_id DROP NOT NULL;

ALTER TABLE public.actor_validation_queue
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'user_suggestion',
  ADD COLUMN IF NOT EXISTS origin_registry text,
  ADD COLUMN IF NOT EXISTS origin_external_id text;

ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_origin_check;
ALTER TABLE public.actor_validation_queue
  ADD CONSTRAINT actor_validation_queue_origin_check
    CHECK (origin IN ('user_suggestion', 'registry_import'));

ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_registry_origin_required;
ALTER TABLE public.actor_validation_queue
  ADD CONSTRAINT actor_validation_queue_registry_origin_required
    CHECK (
      (origin = 'user_suggestion' AND user_personal_actor_id IS NOT NULL)
      OR
      (origin = 'registry_import' AND origin_registry IS NOT NULL AND origin_external_id IS NOT NULL)
    );

ALTER TABLE public.actor_validation_queue
  DROP CONSTRAINT IF EXISTS actor_validation_queue_origin_registry_check;
ALTER TABLE public.actor_validation_queue
  ADD CONSTRAINT actor_validation_queue_origin_registry_check
    CHECK (origin_registry IS NULL OR origin_registry IN ('brreg', 'cvr', 'prh'));

CREATE INDEX IF NOT EXISTS idx_actor_validation_queue_origin_external
  ON public.actor_validation_queue (origin_registry, origin_external_id)
  WHERE origin = 'registry_import';

-- 4. RPC fn_import_actor_from_registry
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

  -- Duplicate detection — actors (compare digits only for org_number)
  SELECT id INTO v_existing_actor
  FROM public.actors
  WHERE regexp_replace(coalesce(org_number, ''), '\D', '', 'g')
      = regexp_replace(v_normalized_external, '\D', '', 'g')
    AND regexp_replace(v_normalized_external, '\D', '', 'g') <> ''
  LIMIT 1;

  IF v_existing_actor IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate_actor',
      'existing_actor_id', v_existing_actor,
      'message', format('Actor with org_number %s already exists', v_normalized_external)
    );
  END IF;

  SELECT id INTO v_existing_queue
  FROM public.actor_validation_queue
  WHERE origin = 'registry_import'
    AND origin_registry = p_registry
    AND origin_external_id = v_normalized_external
    AND status = 'pending'
  LIMIT 1;

  IF v_existing_queue IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate_queue',
      'existing_queue_id', v_existing_queue,
      'message', 'Already in verification queue'
    );
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
    verified_at
  )
  VALUES (
    coalesce(NULLIF(trim(coalesce(p_data->>'actor_name', '')), ''), v_normalized_external),
    NULLIF(p_data->>'country', ''),
    v_normalized_external,
    NULLIF(p_data->>'street_address', ''),
    NULLIF(p_data->>'city', ''),
    NULLIF(p_data->>'region', ''),
    NULLIF(p_data->>'postal_code', ''),
    CASE
      WHEN NULLIF(p_data->>'actor_website', '') IS NOT NULL
        THEN ARRAY[p_data->>'actor_website']
      ELSE ARRAY[]::text[]
    END,
    CASE
      WHEN jsonb_typeof(p_data->'trade_names') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'trade_names'))
      ELSE ARRAY[]::text[]
    END,
    'registry_import',
    'unverified',
    NULL
  )
  RETURNING id INTO v_actor_id;

  INSERT INTO public.actor_validation_queue (
    user_personal_actor_id,
    suggested_by,
    status,
    origin,
    origin_registry,
    origin_external_id,
    duplicate_check_result
  )
  VALUES (
    NULL,
    v_admin_id,
    'pending',
    'registry_import',
    p_registry,
    v_normalized_external,
    p_data
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
      'data', p_data
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