-- D2a: Verified actor geocoding pipeline

-- 1. pg_net for trigger HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schema changes on actors
ALTER TABLE public.actors
  ADD COLUMN latitude numeric,
  ADD COLUMN longitude numeric,
  ADD COLUMN geocoded_at timestamptz,
  ADD COLUMN geocoded_precision text;

ALTER TABLE public.actors
  ADD CONSTRAINT actors_geocoded_precision_check
  CHECK (geocoded_precision IS NULL
    OR geocoded_precision IN ('street', 'postal', 'city', 'country', 'failed'));

ALTER TABLE public.actors DROP COLUMN coordinates;

CREATE INDEX IF NOT EXISTS idx_actors_has_coords
  ON public.actors (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 3. Geocoding trigger
-- Anon key is publishable, safe to embed. URL is fixed for this project.
CREATE OR REPLACE FUNCTION public.fn_actors_trigger_geocoding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_function_url constant text := 'https://ekuherkwhkyzqyodzpji.supabase.co/functions/v1/geocode-actor';
  v_anon_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdWhlcmt3aGt5enF5b2R6cGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTAzNjEsImV4cCI6MjA5MTgyNjM2MX0.hAzSQ5hVGL-ZCB6yDMr3EFMJ5nevRAaegpCSNotalsM';
BEGIN
  IF NEW.latitude IS NOT NULL OR NEW.longitude IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.geocoded_precision = 'failed' THEN
    RETURN NEW;
  END IF;
  IF NEW.country IS NULL
     AND NEW.city IS NULL
     AND NEW.postal_code IS NULL
     AND NEW.street_address IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'actor_id', NEW.id,
      'target_table', 'actors',
      'street_address', NEW.street_address,
      'postal_code', NEW.postal_code,
      'city', NEW.city,
      'region', NEW.region,
      'country', NEW.country
    )
  );

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_actors_geocode_after_change ON public.actors;
CREATE TRIGGER trg_actors_geocode_after_change
  AFTER INSERT OR UPDATE OF street_address, postal_code, city, region, country, latitude
  ON public.actors
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_actors_trigger_geocoding();

-- 4. Backfill RPC (admin-only)
CREATE OR REPLACE FUNCTION public.fn_geocode_missing_actors()
RETURNS TABLE (
  total_attempted int,
  successful int,
  failed int,
  skipped_no_address int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_actor record;
  v_attempted int := 0;
  v_successful int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_function_url constant text := 'https://ekuherkwhkyzqyodzpji.supabase.co/functions/v1/geocode-actor';
  v_anon_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdWhlcmt3aGt5enF5b2R6cGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTAzNjEsImV4cCI6MjA5MTgyNjM2MX0.hAzSQ5hVGL-ZCB6yDMr3EFMJ5nevRAaegpCSNotalsM';
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_actor IN
    SELECT id, street_address, postal_code, city, region, country
    FROM public.actors
    WHERE latitude IS NULL
      AND geocoded_precision IS NULL
  LOOP
    v_attempted := v_attempted + 1;

    IF v_actor.country IS NULL
       AND v_actor.city IS NULL
       AND v_actor.postal_code IS NULL
       AND v_actor.street_address IS NULL THEN
      UPDATE public.actors
        SET geocoded_precision = 'failed', geocoded_at = now()
        WHERE id = v_actor.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object(
        'actor_id', v_actor.id,
        'target_table', 'actors',
        'street_address', v_actor.street_address,
        'postal_code', v_actor.postal_code,
        'city', v_actor.city,
        'region', v_actor.region,
        'country', v_actor.country
      )
    );

    PERFORM pg_sleep(1.1);
  END LOOP;

  v_successful := v_attempted - v_skipped;

  RETURN QUERY SELECT v_attempted, v_successful, v_failed, v_skipped;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_geocode_missing_actors() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_geocode_missing_actors() TO authenticated;