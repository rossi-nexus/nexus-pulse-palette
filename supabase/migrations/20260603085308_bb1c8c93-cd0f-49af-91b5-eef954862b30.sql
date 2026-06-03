
-- ============================================================
-- Batch D: provenance backfill + auto-enrichment media reprocess
-- ============================================================

-- Helper: extract host from a url text
CREATE OR REPLACE FUNCTION public.fn_url_host(_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(coalesce(_url, ''), '^[a-zA-Z]+://', ''),
    '/.*$', ''
  ))
$$;

-- ============================================================
-- 1) fn_backfill_provenance_labels
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_backfill_provenance_labels()
RETURNS TABLE(
  descriptions_updated integer,
  media_updated integer,
  contacts_updated integer,
  tags_updated integer,
  total_processed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_desc int := 0;
  v_media int := 0;
  v_contacts int := 0;
  v_tags int := 0;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- actor_descriptions
  WITH upd AS (
    UPDATE public.actor_descriptions d
    SET source = CASE
      WHEN d.last_enriched_at IS NOT NULL
           AND d.metadata IS NOT NULL
           AND (d.metadata ? 'product_url' OR d.metadata ? 'source_page')
        THEN 'auto_enrichment'
      WHEN d.metadata IS NOT NULL
           AND (d.metadata ? 'from_personal_actor'
                OR d.metadata->>'origin' ILIKE '%personal%'
                OR d.metadata->>'origin' ILIKE '%backfill%')
        THEN 'consultant_completion'
      ELSE 'manual'
    END
    WHERE d.source IS NULL OR d.source = ''
    RETURNING d.id
  )
  SELECT count(*) INTO v_desc FROM upd;

  -- actor_media
  WITH upd AS (
    UPDATE public.actor_media m
    SET source = CASE
      WHEN m.crop_data IS NOT NULL
           AND m.crop_data ? 'source_page'
           AND EXISTS (
             SELECT 1 FROM public.actors a
             WHERE a.id = m.actor_id
               AND a.websites IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM unnest(a.websites) w
                 WHERE public.fn_url_host(w) <> ''
                   AND public.fn_url_host(m.crop_data->>'source_page') = public.fn_url_host(w)
               )
           )
        THEN 'auto_scrape'
      WHEN m.crop_data IS NOT NULL AND m.crop_data ? 'source_page'
        THEN 'auto_enrichment'
      ELSE 'manual'
    END
    WHERE m.source IS NULL OR m.source = ''
    RETURNING m.id
  )
  SELECT count(*) INTO v_media FROM upd;

  -- actor_contacts: correlate with audit_log enrich-from-team-page events
  WITH upd AS (
    UPDATE public.actor_contacts c
    SET source = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.audit_log al
        WHERE al.actor_id = c.actor_id
          AND al.event_type ILIKE '%team_page%'
          AND al.created_at BETWEEN c.created_at - interval '5 seconds' AND c.created_at + interval '5 seconds'
      ) THEN 'auto_enrichment'
      ELSE 'manual'
    END
    WHERE c.source IS NULL OR c.source = ''
    RETURNING c.id
  )
  SELECT count(*) INTO v_contacts FROM upd;

  -- actor_ontology_tags
  WITH upd AS (
    UPDATE public.actor_ontology_tags t
    SET source = CASE
      WHEN t.evidence IS NOT NULL
           AND t.source_url IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.actors a
             WHERE a.id = t.actor_id
               AND a.websites IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM unnest(a.websites) w
                 WHERE public.fn_url_host(w) <> ''
                   AND public.fn_url_host(t.source_url) = public.fn_url_host(w)
               )
           )
        THEN 'auto_enrichment'
      WHEN t.evidence IS NOT NULL AND t.source_url IS NULL
        THEN 'consultant_completion'
      ELSE 'manual'
    END
    WHERE t.source IS NULL OR t.source = ''
    RETURNING t.id
  )
  SELECT count(*) INTO v_tags FROM upd;

  -- audit log entry (single summary row)
  INSERT INTO public.audit_log (event_type, target_table, actor_user_id, changes)
  VALUES (
    'provenance_backfill',
    'actor_descriptions,actor_media,actor_contacts,actor_ontology_tags',
    v_uid,
    jsonb_build_object(
      'descriptions_updated', v_desc,
      'media_updated', v_media,
      'contacts_updated', v_contacts,
      'tags_updated', v_tags
    )
  );

  RETURN QUERY SELECT v_desc, v_media, v_contacts, v_tags, (v_desc + v_media + v_contacts + v_tags);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_backfill_provenance_labels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_backfill_provenance_labels() TO authenticated;

-- ============================================================
-- 2) fn_reprocess_auto_enrichment_media
-- Ports hasStrongProductAssociation() from enrich-product-page/index.ts.
-- Duplication risk: if the TS check evolves, keep this SQL in sync.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_check_strong_product_association(
  _url text,
  _alt text,
  _product_name text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_slug text;
  v_tokens text[];
  v_alt text := lower(coalesce(_alt, ''));
  v_file text := lower(coalesce(_url, ''));
  v_token text;
  v_hits int := 0;
  v_min_hits int;
BEGIN
  IF _product_name IS NULL OR length(trim(_product_name)) = 0 THEN
    RETURN false;
  END IF;

  -- Deny-list mirror (filename heuristics for flags/icons/partner brand assets)
  IF v_file ~* '(favicon|logo|sprite|tracker|pixel|icon[-_/]|flag[-_]|country[-_]flag|partner|badge|award|placeholder|spacer|banner[-_]ad)' THEN
    RETURN false;
  END IF;
  IF v_file ~* '\.svg(\?|$)' AND v_file ~* '(flag|country|\mnor\M|\mswe\M|\mfin\M|\mdnk\M|\musa\M|\mgbr\M)' THEN
    RETURN false;
  END IF;

  -- Normalize slug: lower, non-alnum -> '-', collapse
  v_slug := regexp_replace(lower(_product_name), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');

  -- tokens >=3 chars
  v_tokens := ARRAY(
    SELECT t FROM unnest(string_to_array(v_slug, '-')) AS t
    WHERE length(t) >= 3
  );

  -- og:image with token match
  IF v_alt = 'og:image' THEN
    IF length(v_slug) >= 1 AND position(v_slug in v_file) > 0 THEN RETURN true; END IF;
    FOREACH v_token IN ARRAY v_tokens LOOP
      IF position(v_token in v_file) > 0 THEN RETURN true; END IF;
    END LOOP;
  END IF;

  -- filename contains slug
  IF length(v_slug) >= 4 AND position(v_slug in v_file) > 0 THEN
    RETURN true;
  END IF;

  -- alt text matches product name
  IF length(v_alt) > 0 THEN
    IF position(lower(_product_name) in v_alt) > 0 THEN RETURN true; END IF;
    IF array_length(v_tokens, 1) > 0 THEN
      DECLARE
        v_all boolean := true;
      BEGIN
        FOREACH v_token IN ARRAY v_tokens LOOP
          IF position(v_token in v_alt) = 0 THEN v_all := false; EXIT; END IF;
        END LOOP;
        IF v_all THEN RETURN true; END IF;
      END;
    END IF;
  END IF;

  -- filename token majority match (>=75%)
  IF coalesce(array_length(v_tokens, 1), 0) >= 2 THEN
    v_hits := 0;
    FOREACH v_token IN ARRAY v_tokens LOOP
      IF position(v_token in v_file) > 0 THEN v_hits := v_hits + 1; END IF;
    END LOOP;
    v_min_hits := ceil(array_length(v_tokens, 1) * 0.75);
    IF v_hits >= v_min_hits THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reprocess_auto_enrichment_media()
RETURNS TABLE(
  rows_inspected integer,
  rows_orphaned integer,
  rows_kept_linked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
  v_inspected int := 0;
  v_orphaned int := 0;
  v_kept int := 0;
  v_linked boolean;
  v_alt text;
  v_product text;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  FOR v_row IN
    SELECT id, url, original_url, crop_data
    FROM public.actor_media
    WHERE source = 'auto_enrichment'
      AND type = 'product'
      AND crop_data IS NOT NULL
      AND crop_data ? 'linked_product_name'
      AND coalesce(crop_data->>'linked_product_name', '') <> ''
  LOOP
    v_inspected := v_inspected + 1;
    v_product := v_row.crop_data->>'linked_product_name';
    v_alt := coalesce(v_row.crop_data->>'alt', '');

    v_linked := public.fn_check_strong_product_association(
      coalesce(v_row.original_url, v_row.url),
      v_alt,
      v_product
    );

    IF v_linked THEN
      v_kept := v_kept + 1;
    ELSE
      UPDATE public.actor_media
      SET crop_data = (
        coalesce(crop_data, '{}'::jsonb)
        || jsonb_build_object(
             'candidate_product_name', v_product,
             'link_reason', 'reprocessed: no explicit product-association signal',
             'reprocessed_at', to_jsonb(now())
           )
      ) - 'linked_product_name'
      WHERE id = v_row.id;
      v_orphaned := v_orphaned + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_log (event_type, target_table, actor_user_id, changes)
  VALUES (
    'auto_enrichment_media_reprocess',
    'actor_media',
    v_uid,
    jsonb_build_object(
      'rows_inspected', v_inspected,
      'rows_orphaned', v_orphaned,
      'rows_kept_linked', v_kept
    )
  );

  RETURN QUERY SELECT v_inspected, v_orphaned, v_kept;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reprocess_auto_enrichment_media() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reprocess_auto_enrichment_media() TO authenticated;
