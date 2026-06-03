-- AX2 Foundation — data + infrastructure prep for AX3a multi-axis ranking.
-- Additive only. No ranking logic changes.

-- =========================================================================
-- 1. Indexes
-- =========================================================================

-- Hot-path join for fn_rank_actors_by_ontology_overlap.
CREATE INDEX IF NOT EXISTS idx_actor_ontology_tags_entry_actor
  ON public.actor_ontology_tags(ontology_entry_id, actor_id)
  INCLUDE (confidence);

-- Supports the p_countries text[] filter AX3a will add to the ranking RPC.
CREATE INDEX IF NOT EXISTS idx_actors_country
  ON public.actors(country);

-- =========================================================================
-- 2. Extensions for geographic scoring (AX3a)
-- Trigger point for the GIST(ll_to_earth(...)) functional index documented
-- in the AX1 audit: > 100k verified actors. Not added now; revisit in AX3a.
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- =========================================================================
-- 3. Satellite tables — source provenance + capacity-can-be-actor-wide.
-- actor_ontology_tag_id was NOT NULL on actor_capacity_attributes; relax it
-- so capacity signals can be attached to the actor as a whole when no
-- specific tag context exists (the common analyze-actor case).
-- =========================================================================
ALTER TABLE public.actor_capacity_attributes
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ALTER COLUMN actor_ontology_tag_id DROP NOT NULL;

ALTER TABLE public.actor_standards
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- =========================================================================
-- 4. Confidence backfill for actor_ontology_tags
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_backfill_ontology_tag_confidence()
RETURNS TABLE (rows_updated int, rows_with_confidence int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_updated int := 0;
  v_with_conf int := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH targets AS (
    SELECT
      t.id,
      CASE
        WHEN t.source = 'consultant_completion'
             AND EXISTS (SELECT 1 FROM public.actors a
                         WHERE a.id = t.actor_id
                           AND a.verification_status = 'verified')
          THEN 'high'
        WHEN t.evidence IS NOT NULL AND length(trim(t.evidence)) > 0
          THEN 'medium'
        WHEN t.source IN ('search','api_connector','pipeline_search','pipeline_analysis','auto_enrichment','url_scrape','web_search','document','registry')
             AND t.source_url IS NOT NULL AND length(trim(t.source_url)) > 0
          THEN 'medium'
        ELSE 'low'
      END AS new_confidence
    FROM public.actor_ontology_tags t
    WHERE t.confidence IS NULL
  ),
  upd AS (
    UPDATE public.actor_ontology_tags t
    SET confidence = targets.new_confidence
    FROM targets
    WHERE t.id = targets.id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_updated FROM upd;

  SELECT count(*)::int INTO v_with_conf
  FROM public.actor_ontology_tags
  WHERE confidence IS NOT NULL;

  RETURN QUERY SELECT v_updated, v_with_conf;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_backfill_ontology_tag_confidence() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_backfill_ontology_tag_confidence() TO authenticated;

-- =========================================================================
-- 5. Geocode verified actors — mirror of fn_geocode_missing_personal_actors
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_geocode_missing_verified_actors()
RETURNS TABLE (
  processed_count int,
  remaining_count int,
  total_count int,
  processed_actor_id uuid,
  processed_actor_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_row record;
  v_total int;
  v_function_url constant text := 'https://ekuherkwhkyzqyodzpji.supabase.co/functions/v1/geocode-actor';
  v_anon_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdWhlcmt3aGt5enF5b2R6cGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTAzNjEsImV4cCI6MjA5MTgyNjM2MX0.hAzSQ5hVGL-ZCB6yDMr3EFMJ5nevRAaegpCSNotalsM';
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*)::int INTO v_total
  FROM public.actors
  WHERE verification_status = 'verified'
    AND latitude IS NULL
    AND longitude IS NULL
    AND geocoded_precision IS NULL
    AND (street_address IS NOT NULL OR city IS NOT NULL OR postal_code IS NOT NULL);

  IF v_total = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT id, legal_name, street_address, postal_code, city, region, country
    INTO v_row
  FROM public.actors
  WHERE verification_status = 'verified'
    AND latitude IS NULL
    AND longitude IS NULL
    AND geocoded_precision IS NULL
    AND (street_address IS NOT NULL OR city IS NOT NULL OR postal_code IS NOT NULL)
  ORDER BY verified_at DESC NULLS LAST, updated_at DESC
  LIMIT 1;

  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'actor_id', v_row.id,
      'target_table', 'actors',
      'street_address', v_row.street_address,
      'postal_code', v_row.postal_code,
      'city', v_row.city,
      'region', v_row.region,
      'country', v_row.country
    )
  );

  RETURN QUERY SELECT 1, GREATEST(v_total - 1, 0), v_total, v_row.id, v_row.legal_name;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_geocode_missing_verified_actors() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_geocode_missing_verified_actors() TO authenticated;

-- =========================================================================
-- 6. Persist enrichment-derived capacity + standards.
-- Called by analyze-actor (service-role) and by admin tooling. Idempotent.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_persist_actor_enrichment(
  p_actor_id uuid,
  p_capacity jsonb DEFAULT '[]'::jsonb,
  p_standards jsonb DEFAULT '[]'::jsonb,
  p_source_url text DEFAULT NULL
) RETURNS TABLE (capacity_inserted int, standards_inserted int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_capacity_inserted int := 0;
  v_standards_inserted int := 0;
  v_item jsonb;
  v_attr_type text;
  v_value_text text;
  v_valid_from date;
  v_valid_to date;
BEGIN
  -- Service-role bypass: auth.uid() is NULL when invoked with the service-role
  -- key from an edge function. Authenticated callers must be admin.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.actors WHERE id = p_actor_id) THEN
    RAISE EXCEPTION 'actor % does not exist', p_actor_id;
  END IF;

  -- Capacity: idempotent on (actor_id, attribute_type, value_text).
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_capacity, '[]'::jsonb)) LOOP
    v_attr_type := lower(NULLIF(v_item->>'attribute_type', ''));
    v_value_text := NULLIF(v_item->>'value_text', '');
    CONTINUE WHEN v_attr_type IS NULL OR v_value_text IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM public.actor_capacity_attributes
      WHERE actor_id = p_actor_id
        AND attribute_type = v_attr_type
        AND value_text = v_value_text
    ) THEN
      INSERT INTO public.actor_capacity_attributes (
        actor_id, attribute_type, value_text, value_min, value_max, unit, evidence,
        source, source_url, actor_ontology_tag_id
      ) VALUES (
        p_actor_id,
        v_attr_type,
        v_value_text,
        NULLIF(v_item->>'value_min', '')::numeric,
        NULLIF(v_item->>'value_max', '')::numeric,
        NULLIF(v_item->>'unit', ''),
        NULLIF(v_item->>'evidence', ''),
        'auto_enrichment',
        COALESCE(NULLIF(v_item->>'source_url', ''), p_source_url),
        NULL
      );
      v_capacity_inserted := v_capacity_inserted + 1;
    END IF;
  END LOOP;

  -- Standards: idempotent on (actor_id, lower(standard_name)).
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_standards, '[]'::jsonb)) LOOP
    v_value_text := NULLIF(v_item->>'standard_name', '');
    CONTINUE WHEN v_value_text IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM public.actor_standards
      WHERE actor_id = p_actor_id
        AND lower(standard_name) = lower(v_value_text)
    ) THEN
      BEGIN
        v_valid_from := NULLIF(v_item->>'valid_from', '')::date;
      EXCEPTION WHEN OTHERS THEN v_valid_from := NULL;
      END;
      BEGIN
        v_valid_to := NULLIF(v_item->>'valid_to', '')::date;
      EXCEPTION WHEN OTHERS THEN v_valid_to := NULL;
      END;

      INSERT INTO public.actor_standards (
        actor_id, standard_name, standard_number, certifying_body,
        valid_from, valid_to, evidence, source, source_url
      ) VALUES (
        p_actor_id,
        v_value_text,
        NULLIF(v_item->>'standard_number', ''),
        NULLIF(v_item->>'certifying_body', ''),
        v_valid_from,
        v_valid_to,
        NULLIF(v_item->>'evidence', ''),
        'auto_enrichment',
        COALESCE(NULLIF(v_item->>'source_url', ''), p_source_url)
      );
      v_standards_inserted := v_standards_inserted + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_capacity_inserted, v_standards_inserted;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_persist_actor_enrichment(uuid, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_persist_actor_enrichment(uuid, jsonb, jsonb, text) TO authenticated, service_role;