-- V3 actor-card pre-batch hotfix: single-row geocoding to avoid statement timeout.
-- Replaces previous fn that looped over all candidates inside one SECURITY DEFINER tx.

DROP FUNCTION IF EXISTS public.fn_geocode_missing_personal_actors();

CREATE OR REPLACE FUNCTION public.fn_geocode_missing_personal_actors()
RETURNS TABLE (
  processed_count int,
  remaining_count int,
  total_count int,
  processed_actor_id uuid,
  processed_actor_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_row record;
  v_total int;
  v_function_url constant text := 'https://ekuherkwhkyzqyodzpji.supabase.co/functions/v1/geocode-actor';
  v_anon_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdWhlcmt3aGt5enF5b2R6cGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTAzNjEsImV4cCI6MjA5MTgyNjM2MX0.hAzSQ5hVGL-ZCB6yDMr3EFMJ5nevRAaegpCSNotalsM';
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Count candidates up front.
  SELECT count(*)::int INTO v_total
  FROM public.user_personal_actors
  WHERE latitude IS NULL
    AND geocoded_precision IS NULL;

  IF v_total = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Pick one candidate.
  SELECT id, actor_name, street_address, postal_code, city, region, country
    INTO v_row
  FROM public.user_personal_actors
  WHERE latitude IS NULL
    AND geocoded_precision IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  -- No address at all → mark failed locally, count as processed.
  IF v_row.country IS NULL
     AND v_row.city IS NULL
     AND v_row.postal_code IS NULL
     AND v_row.street_address IS NULL THEN
    UPDATE public.user_personal_actors
      SET geocoded_precision = 'failed', geocoded_at = now()
      WHERE id = v_row.id;
    RETURN QUERY SELECT 1, GREATEST(v_total - 1, 0), v_total, v_row.id, v_row.actor_name;
    RETURN;
  END IF;

  -- Fire-and-forget HTTP call to the geocode-actor edge function.
  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'actor_id', v_row.id,
      'target_table', 'user_personal_actors',
      'street_address', v_row.street_address,
      'postal_code', v_row.postal_code,
      'city', v_row.city,
      'region', v_row.region,
      'country', v_row.country
    )
  );

  RETURN QUERY SELECT 1, GREATEST(v_total - 1, 0), v_total, v_row.id, v_row.actor_name;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_geocode_missing_personal_actors() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_geocode_missing_personal_actors() TO authenticated;