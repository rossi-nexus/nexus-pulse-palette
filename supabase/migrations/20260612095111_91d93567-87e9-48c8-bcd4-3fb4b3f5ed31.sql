
-- DH-01 country normalization
-- Single source of truth for ISO 3166-1 alpha-2 normalization at the DB layer.
-- Mirrors src/lib/normalizeCountry.ts and supabase/functions/_shared/country.ts —
-- keep all three in sync when adding countries.

CREATE OR REPLACE FUNCTION public.fn_normalize_country(v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed text;
  upper2  text;
  lower   text;
  iso     text;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  trimmed := btrim(v);
  IF trimmed = '' THEN RETURN NULL; END IF;
  upper2 := upper(trimmed);
  -- already ISO?
  IF length(upper2) = 2 AND upper2 IN (
    'NO','SE','FI','DK','IS','EE','LV','LT','DE','FR','IT','ES','PT','NL','BE','LU','IE','AT','CH',
    'PL','CZ','SK','HU','SI','HR','GR','BG','RO','CY','MT','AL','ME','MK','TR',
    'GB','US','CA','AU','NZ'
  ) THEN
    RETURN upper2;
  END IF;
  lower := lower(trimmed);
  iso := CASE lower
    WHEN 'norway' THEN 'NO' WHEN 'norge' THEN 'NO' WHEN 'noreg' THEN 'NO'
    WHEN 'sweden' THEN 'SE' WHEN 'sverige' THEN 'SE'
    WHEN 'finland' THEN 'FI' WHEN 'suomi' THEN 'FI'
    WHEN 'denmark' THEN 'DK' WHEN 'danmark' THEN 'DK'
    WHEN 'iceland' THEN 'IS' WHEN 'island' THEN 'IS'
    WHEN 'estonia' THEN 'EE' WHEN 'eesti' THEN 'EE'
    WHEN 'latvia' THEN 'LV' WHEN 'latvija' THEN 'LV'
    WHEN 'lithuania' THEN 'LT' WHEN 'lietuva' THEN 'LT'
    WHEN 'germany' THEN 'DE' WHEN 'deutschland' THEN 'DE'
    WHEN 'france' THEN 'FR'
    WHEN 'italy' THEN 'IT' WHEN 'italia' THEN 'IT'
    WHEN 'spain' THEN 'ES' WHEN 'españa' THEN 'ES' WHEN 'espana' THEN 'ES'
    WHEN 'portugal' THEN 'PT'
    WHEN 'netherlands' THEN 'NL' WHEN 'holland' THEN 'NL' WHEN 'nederland' THEN 'NL'
    WHEN 'belgium' THEN 'BE' WHEN 'belgie' THEN 'BE' WHEN 'belgië' THEN 'BE'
    WHEN 'luxembourg' THEN 'LU'
    WHEN 'ireland' THEN 'IE' WHEN 'éire' THEN 'IE' WHEN 'eire' THEN 'IE'
    WHEN 'austria' THEN 'AT' WHEN 'österreich' THEN 'AT' WHEN 'osterreich' THEN 'AT'
    WHEN 'switzerland' THEN 'CH' WHEN 'schweiz' THEN 'CH' WHEN 'suisse' THEN 'CH'
    WHEN 'poland' THEN 'PL' WHEN 'polska' THEN 'PL'
    WHEN 'czech republic' THEN 'CZ' WHEN 'czechia' THEN 'CZ' WHEN 'česko' THEN 'CZ' WHEN 'cesko' THEN 'CZ'
    WHEN 'slovakia' THEN 'SK' WHEN 'slovensko' THEN 'SK'
    WHEN 'hungary' THEN 'HU' WHEN 'magyarország' THEN 'HU' WHEN 'magyarorszag' THEN 'HU'
    WHEN 'slovenia' THEN 'SI' WHEN 'slovenija' THEN 'SI'
    WHEN 'croatia' THEN 'HR' WHEN 'hrvatska' THEN 'HR'
    WHEN 'greece' THEN 'GR' WHEN 'ellada' THEN 'GR'
    WHEN 'bulgaria' THEN 'BG'
    WHEN 'romania' THEN 'RO'
    WHEN 'cyprus' THEN 'CY'
    WHEN 'malta' THEN 'MT'
    WHEN 'albania' THEN 'AL' WHEN 'shqipëria' THEN 'AL' WHEN 'shqiperia' THEN 'AL'
    WHEN 'montenegro' THEN 'ME' WHEN 'crna gora' THEN 'ME'
    WHEN 'north macedonia' THEN 'MK' WHEN 'macedonia' THEN 'MK'
    WHEN 'turkey' THEN 'TR' WHEN 'türkiye' THEN 'TR' WHEN 'turkiye' THEN 'TR'
    WHEN 'united kingdom' THEN 'GB' WHEN 'uk' THEN 'GB' WHEN 'great britain' THEN 'GB' WHEN 'britain' THEN 'GB' WHEN 'england' THEN 'GB' WHEN 'scotland' THEN 'GB' WHEN 'wales' THEN 'GB'
    WHEN 'united states' THEN 'US' WHEN 'usa' THEN 'US' WHEN 'u.s.' THEN 'US' WHEN 'u.s.a.' THEN 'US' WHEN 'america' THEN 'US'
    WHEN 'canada' THEN 'CA'
    WHEN 'australia' THEN 'AU'
    WHEN 'new zealand' THEN 'NZ'
    ELSE NULL
  END;
  IF iso IS NOT NULL THEN RETURN iso; END IF;
  -- Unknown — preserve original input verbatim (do not destroy data).
  RETURN trimmed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_normalize_country(text) TO authenticated, anon, service_role;

-- Trigger function applied to both actors and user_personal_actors.
CREATE OR REPLACE FUNCTION public.fn_normalize_country_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.country IS NOT NULL THEN
    NEW.country := public.fn_normalize_country(NEW.country);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_country ON public.actors;
CREATE TRIGGER trg_normalize_country
  BEFORE INSERT OR UPDATE OF country ON public.actors
  FOR EACH ROW EXECUTE FUNCTION public.fn_normalize_country_trigger();

DROP TRIGGER IF EXISTS trg_normalize_country ON public.user_personal_actors;
CREATE TRIGGER trg_normalize_country
  BEFORE INSERT OR UPDATE OF country ON public.user_personal_actors
  FOR EACH ROW EXECUTE FUNCTION public.fn_normalize_country_trigger();

-- Admin-only backfill: normalize existing rows in both tables.
CREATE OR REPLACE FUNCTION public.fn_backfill_country_normalization()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  actors_updated int := 0;
  ppl_updated   int := 0;
  actors_unrec  jsonb;
  ppl_unrec     jsonb;
BEGIN
  SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  WITH upd AS (
    UPDATE public.actors a
    SET country = public.fn_normalize_country(a.country)
    WHERE a.country IS NOT NULL
      AND a.country IS DISTINCT FROM public.fn_normalize_country(a.country)
    RETURNING 1
  )
  SELECT count(*) INTO actors_updated FROM upd;

  WITH upd AS (
    UPDATE public.user_personal_actors a
    SET country = public.fn_normalize_country(a.country)
    WHERE a.country IS NOT NULL
      AND a.country IS DISTINCT FROM public.fn_normalize_country(a.country)
    RETURNING 1
  )
  SELECT count(*) INTO ppl_updated FROM upd;

  -- Anything still non-ISO post-normalization = unrecognized.
  SELECT coalesce(jsonb_agg(DISTINCT country), '[]'::jsonb) INTO actors_unrec
  FROM public.actors
  WHERE country IS NOT NULL
    AND NOT (length(country) = 2 AND country = upper(country));

  SELECT coalesce(jsonb_agg(DISTINCT country), '[]'::jsonb) INTO ppl_unrec
  FROM public.user_personal_actors
  WHERE country IS NOT NULL
    AND NOT (length(country) = 2 AND country = upper(country));

  RETURN jsonb_build_object(
    'actors', jsonb_build_object('rows_updated', actors_updated, 'rows_unrecognized', actors_unrec),
    'user_personal_actors', jsonb_build_object('rows_updated', ppl_updated, 'rows_unrecognized', ppl_unrec)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_backfill_country_normalization() TO authenticated;

-- Admin-only: resolve NULL countries from registry origin (org_number length).
CREATE OR REPLACE FUNCTION public.fn_resolve_missing_countries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  actors_resolved int := 0;
  ppl_resolved   int := 0;
  actors_remaining jsonb;
  ppl_remaining   jsonb;
BEGIN
  SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- BRREG (NO) — 9-digit org numbers
  WITH upd AS (
    UPDATE public.actors SET country = 'NO'
    WHERE country IS NULL AND org_number IS NOT NULL
      AND length(regexp_replace(org_number, '\D', '', 'g')) = 9
    RETURNING 1
  ) SELECT count(*) INTO actors_resolved FROM upd;

  -- CVR (DK) — 8-digit org numbers
  WITH upd AS (
    UPDATE public.actors SET country = 'DK'
    WHERE country IS NULL AND org_number IS NOT NULL
      AND length(regexp_replace(org_number, '\D', '', 'g')) = 8
    RETURNING 1
  ) SELECT actors_resolved + count(*) INTO actors_resolved FROM upd;

  -- PRH (FI) — 7-digit (or with dash, e.g. 1234567-8)
  WITH upd AS (
    UPDATE public.actors SET country = 'FI'
    WHERE country IS NULL AND org_number IS NOT NULL
      AND length(regexp_replace(org_number, '\D', '', 'g')) IN (7, 8)
      AND org_number ~ '-'
    RETURNING 1
  ) SELECT actors_resolved + count(*) INTO actors_resolved FROM upd;

  -- Same for user_personal_actors
  WITH upd AS (
    UPDATE public.user_personal_actors SET country = 'NO'
    WHERE country IS NULL AND org_number IS NOT NULL
      AND length(regexp_replace(org_number, '\D', '', 'g')) = 9
    RETURNING 1
  ) SELECT count(*) INTO ppl_resolved FROM upd;

  WITH upd AS (
    UPDATE public.user_personal_actors SET country = 'DK'
    WHERE country IS NULL AND org_number IS NOT NULL
      AND length(regexp_replace(org_number, '\D', '', 'g')) = 8
    RETURNING 1
  ) SELECT ppl_resolved + count(*) INTO ppl_resolved FROM upd;

  WITH upd AS (
    UPDATE public.user_personal_actors SET country = 'FI'
    WHERE country IS NULL AND org_number IS NOT NULL
      AND length(regexp_replace(org_number, '\D', '', 'g')) IN (7, 8)
      AND org_number ~ '-'
    RETURNING 1
  ) SELECT ppl_resolved + count(*) INTO ppl_resolved FROM upd;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', legal_name)), '[]'::jsonb)
    INTO actors_remaining
  FROM public.actors WHERE country IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', actor_name)), '[]'::jsonb)
    INTO ppl_remaining
  FROM public.user_personal_actors WHERE country IS NULL;

  RETURN jsonb_build_object(
    'actors', jsonb_build_object('rows_resolved', actors_resolved, 'rows_remaining', actors_remaining),
    'user_personal_actors', jsonb_build_object('rows_resolved', ppl_resolved, 'rows_remaining', ppl_remaining)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_missing_countries() TO authenticated;
