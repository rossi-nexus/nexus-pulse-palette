
-- =====================================================================
-- AX3a — Ranking core
-- =====================================================================

-- 1) Fix outcome-type mapping + remove diagnostic RAISE WARNING.
CREATE OR REPLACE FUNCTION public.fn_compute_actor_relevance_score(
  p_actor_id uuid,
  p_role_id uuid DEFAULT NULL,
  p_ontology_entry_ids uuid[] DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  c_overlap_floor   constant numeric := 0.3;
  c_outcome_min     constant numeric := 0.4;
  c_outcome_max     constant numeric := 1.5;
  c_unverified_mod  constant numeric := 0.8;
  c_decayed_mod     constant numeric := 0.6;
  c_near_decay_mod  constant numeric := 0.85;
  c_recent_mod      constant numeric := 1.15;
  v_base_score numeric := 0.5;
  v_outcome_modifier numeric := 1.0;
  v_decay_modifier numeric := 1.0;
  v_overlap_score numeric := 0.0;
  v_outcome_sum numeric := 0.0;
  v_verified_at timestamptz;
  v_decays_at timestamptz;
BEGIN
  IF p_ontology_entry_ids IS NOT NULL AND array_length(p_ontology_entry_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(
      CASE ot.confidence
        WHEN 'high'   THEN 1.0
        WHEN 'medium' THEN 0.7
        WHEN 'low'    THEN 0.4
        ELSE 0.5
      END
    ), 0) / GREATEST(array_length(p_ontology_entry_ids, 1), 1)
    INTO v_overlap_score
    FROM public.actor_ontology_tags ot
    WHERE ot.actor_id = p_actor_id
      AND ot.ontology_entry_id = ANY(p_ontology_entry_ids);
    v_base_score := LEAST(1.0, c_overlap_floor + v_overlap_score);
  END IF;

  -- Outcome modifier with proper enum mapping + time decay.
  SELECT COALESCE(SUM(
    (CASE po.outcome_type
       WHEN 'delivered'    THEN  1.0
       WHEN 'contracted'   THEN  0.7
       WHEN 'engaged'      THEN  0.1
       WHEN 'declined'     THEN  0.0
       WHEN 'disappointed' THEN -0.5
       ELSE 0.0
     END)
    *
    (CASE
       WHEN po.recorded_at > now() - interval '12 months' THEN 1.0
       WHEN po.recorded_at > now() - interval '24 months' THEN 0.5
       WHEN po.recorded_at > now() - interval '36 months' THEN 0.25
       ELSE 0.0
     END)
  ), 0)
  INTO v_outcome_sum
  FROM public.programme_outcomes po
  WHERE po.actor_id = p_actor_id;
  v_outcome_modifier := GREATEST(c_outcome_min, LEAST(c_outcome_max, 1.0 + v_outcome_sum));

  SELECT a.verified_at, a.decays_at INTO v_verified_at, v_decays_at
  FROM public.actors a WHERE a.id = p_actor_id;

  IF v_verified_at IS NULL THEN
    v_decay_modifier := c_unverified_mod;
  ELSIF v_decays_at IS NOT NULL AND v_decays_at < now() THEN
    v_decay_modifier := c_decayed_mod;
  ELSIF v_decays_at IS NOT NULL AND v_decays_at < now() + interval '30 days' THEN
    v_decay_modifier := c_near_decay_mod;
  ELSIF v_verified_at > now() - interval '90 days' THEN
    v_decay_modifier := c_recent_mod;
  ELSE
    v_decay_modifier := 1.0;
  END IF;

  RETURN ROUND((v_base_score * v_outcome_modifier * v_decay_modifier)::numeric, 4);
END;
$function$;

-- 2) Country filter on overlap RPC.
DROP FUNCTION IF EXISTS public.fn_rank_actors_by_ontology_overlap(uuid[], integer);
CREATE OR REPLACE FUNCTION public.fn_rank_actors_by_ontology_overlap(
  p_entry_ids uuid[],
  p_limit integer DEFAULT 20,
  p_countries text[] DEFAULT NULL
)
RETURNS TABLE(
  actor_id uuid,
  legal_name text,
  websites text[],
  country text,
  city text,
  region text,
  latitude numeric,
  longitude numeric,
  verification_status text,
  verified_at timestamptz,
  decays_at timestamptz,
  overlap_count numeric,
  matched_entry_ids uuid[]
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    a.id, a.legal_name, a.websites, a.country, a.city, a.region,
    a.latitude, a.longitude,
    a.verification_status, a.verified_at, a.decays_at,
    ROUND(SUM(
      CASE t.confidence
        WHEN 'high'   THEN 1.0
        WHEN 'medium' THEN 0.7
        WHEN 'low'    THEN 0.4
        ELSE 0.5
      END
    )::numeric, 2) AS overlap_count,
    array_agg(DISTINCT t.ontology_entry_id) AS matched_entry_ids
  FROM public.actors a
  JOIN public.actor_ontology_tags t ON t.actor_id = a.id
  WHERE t.ontology_entry_id = ANY(p_entry_ids)
    AND a.verification_status = 'verified'
    AND (p_countries IS NULL OR a.country = ANY(p_countries))
  GROUP BY a.id
  ORDER BY SUM(
    CASE t.confidence
      WHEN 'high'   THEN 1.0
      WHEN 'medium' THEN 0.7
      WHEN 'low'    THEN 0.4
      ELSE 0.5
    END
  ) DESC, a.verified_at DESC NULLS LAST
  LIMIT p_limit
$function$;

GRANT EXECUTE ON FUNCTION public.fn_rank_actors_by_ontology_overlap(uuid[], integer, text[]) TO authenticated, anon, service_role;

-- 3) v2 relevance RPC: array-accepting, multi-axis, returns breakdown.
CREATE OR REPLACE FUNCTION public.fn_compute_actor_relevance_score_v2(
  p_actor_ids uuid[],
  p_constraints jsonb DEFAULT '{}'::jsonb,
  p_weights jsonb DEFAULT NULL
)
RETURNS TABLE(actor_id uuid, total_score numeric, breakdown jsonb)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  -- Default weights (Tore's confirmed answers)
  w_ontology   numeric := 0.35;
  w_geography  numeric := 0.20;
  w_outcome    numeric := 0.15;
  w_decay      numeric := 0.10;
  w_capacity   numeric := 0.10;
  w_cert       numeric := 0.10;

  -- Constraint inputs
  v_entry_ids uuid[];
  v_countries text[];
  v_center_lat numeric;
  v_center_lon numeric;
  v_radius_km numeric;
  v_min_team int;
  v_max_mob_days int;
  v_req_certs text[];
  v_pref_certs text[];

  -- Per-actor scratch
  r_actor record;
  v_aid uuid;
  v_actor record;

  v_ontology_score numeric;
  v_matched_tags jsonb;
  v_inherited_tags jsonb;
  v_group_parent text;

  v_outcome_modifier numeric;
  v_outcome_score numeric;
  v_outcome_count int;
  v_outcome_sum numeric;

  v_decay_score numeric;

  v_geo_score numeric;
  v_geo_distance numeric;
  v_geo_filter text;

  v_team_size numeric;
  v_mob_days numeric;
  v_mob_text text;
  v_cap_signals jsonb;
  v_cap_score numeric;
  v_cap_n int;

  v_cert_matched text[];
  v_cert_missing text[];
  v_cert_score numeric;
  v_present_pref int;

  v_total numeric;
  v_breakdown jsonb;
BEGIN
  -- Apply weight overrides (deep-merge: only override provided keys).
  IF p_weights IS NOT NULL THEN
    w_ontology  := COALESCE((p_weights->>'ontology')::numeric, w_ontology);
    w_geography := COALESCE((p_weights->>'geography')::numeric, w_geography);
    w_outcome   := COALESCE((p_weights->>'outcome')::numeric, w_outcome);
    w_decay     := COALESCE((p_weights->>'decay')::numeric, w_decay);
    w_capacity  := COALESCE((p_weights->>'capacity')::numeric, w_capacity);
    w_cert      := COALESCE((p_weights->>'certification')::numeric, w_cert);
  END IF;

  -- Parse constraints
  IF p_constraints ? 'ontology_entry_ids' THEN
    SELECT array_agg((e)::uuid) INTO v_entry_ids
    FROM jsonb_array_elements_text(p_constraints->'ontology_entry_ids') AS e;
  END IF;

  IF p_constraints->'geography' ? 'countries' THEN
    SELECT array_agg(e) INTO v_countries
    FROM jsonb_array_elements_text(p_constraints->'geography'->'countries') AS e;
  END IF;
  v_center_lat := NULLIF(p_constraints->'geography'->>'center_lat','')::numeric;
  v_center_lon := NULLIF(p_constraints->'geography'->>'center_lon','')::numeric;
  v_radius_km  := NULLIF(p_constraints->'geography'->>'radius_km','')::numeric;

  v_min_team     := NULLIF(p_constraints->'capacity'->>'min_team_size','')::int;
  v_max_mob_days := NULLIF(p_constraints->'capacity'->>'max_mobilization_days','')::int;

  IF p_constraints->'certifications' ? 'required' THEN
    SELECT array_agg(e) INTO v_req_certs
    FROM jsonb_array_elements_text(p_constraints->'certifications'->'required') AS e;
  END IF;
  IF p_constraints->'certifications' ? 'preferred' THEN
    SELECT array_agg(e) INTO v_pref_certs
    FROM jsonb_array_elements_text(p_constraints->'certifications'->'preferred') AS e;
  END IF;

  FOREACH v_aid IN ARRAY p_actor_ids LOOP
    SELECT a.* INTO v_actor FROM public.actors a WHERE a.id = v_aid;
    IF v_actor.id IS NULL THEN CONTINUE; END IF;

    -- ----- Ontology subscore with parent-group rollup -----
    v_ontology_score := 0.5;  -- neutral when no constraint
    v_matched_tags := '[]'::jsonb;
    v_inherited_tags := '[]'::jsonb;
    v_group_parent := NULL;

    IF v_entry_ids IS NOT NULL AND array_length(v_entry_ids,1) > 0 THEN
      WITH direct AS (
        SELECT ot.ontology_entry_id AS eid,
               CASE ot.confidence
                 WHEN 'high' THEN 1.0 WHEN 'medium' THEN 0.7
                 WHEN 'low' THEN 0.4 ELSE 0.5 END AS w
        FROM public.actor_ontology_tags ot
        WHERE ot.actor_id = v_aid
          AND ot.ontology_entry_id = ANY(v_entry_ids)
      ),
      ancestors AS (
        SELECT ar.source_actor_id AS aid
        FROM public.actor_relationships ar
        WHERE ar.target_actor_id = v_aid AND ar.relationship_type = 'parent_of'
        UNION
        SELECT ar.source_actor_id
        FROM public.actor_relationships ar
        JOIN ancestors anc ON ar.target_actor_id = anc.aid
        WHERE ar.relationship_type = 'parent_of'
      ),
      inherited AS (
        SELECT ot.ontology_entry_id AS eid,
               0.6 * (CASE ot.confidence
                        WHEN 'high' THEN 1.0 WHEN 'medium' THEN 0.7
                        WHEN 'low' THEN 0.4 ELSE 0.5 END) AS w
        FROM public.actor_ontology_tags ot
        JOIN ancestors a ON ot.actor_id = a.aid
        WHERE ot.ontology_entry_id = ANY(v_entry_ids)
          AND ot.ontology_entry_id NOT IN (SELECT eid FROM direct)
      ),
      combined AS (
        SELECT eid, MAX(w) AS w FROM (
          SELECT * FROM direct UNION ALL SELECT * FROM inherited
        ) s GROUP BY eid
      )
      SELECT
        LEAST(1.0, COALESCE(SUM(w),0) / GREATEST(array_length(v_entry_ids,1),1)),
        COALESCE(jsonb_agg(DISTINCT eid::text) FILTER (WHERE eid IN (SELECT eid FROM direct)), '[]'::jsonb),
        COALESCE(jsonb_agg(DISTINCT eid::text) FILTER (WHERE eid IN (SELECT eid FROM inherited)), '[]'::jsonb)
      INTO v_ontology_score, v_matched_tags, v_inherited_tags
      FROM combined;

      SELECT a.legal_name INTO v_group_parent
      FROM public.actor_relationships ar
      JOIN public.actors a ON a.id = ar.source_actor_id
      WHERE ar.target_actor_id = v_aid AND ar.relationship_type = 'parent_of'
      LIMIT 1;
    END IF;

    -- ----- Outcome subscore -----
    SELECT COUNT(*), COALESCE(SUM(
      (CASE po.outcome_type
         WHEN 'delivered'    THEN  1.0
         WHEN 'contracted'   THEN  0.7
         WHEN 'engaged'      THEN  0.1
         WHEN 'declined'     THEN  0.0
         WHEN 'disappointed' THEN -0.5
         ELSE 0.0
       END)
      *
      (CASE
         WHEN po.recorded_at > now() - interval '12 months' THEN 1.0
         WHEN po.recorded_at > now() - interval '24 months' THEN 0.5
         WHEN po.recorded_at > now() - interval '36 months' THEN 0.25
         ELSE 0.0
       END)
    ),0)
    INTO v_outcome_count, v_outcome_sum
    FROM public.programme_outcomes po
    WHERE po.actor_id = v_aid;
    v_outcome_modifier := GREATEST(0.4, LEAST(1.5, 1.0 + v_outcome_sum));
    -- Normalise modifier (0.4..1.5) into 0..1.
    v_outcome_score := ROUND(((v_outcome_modifier - 0.4) / 1.1)::numeric, 4);

    -- ----- Decay subscore (0..1) -----
    IF v_actor.verified_at IS NULL THEN
      v_decay_score := 0.4;
    ELSIF v_actor.decays_at IS NOT NULL AND v_actor.decays_at < now() THEN
      v_decay_score := 0.3;
    ELSIF v_actor.decays_at IS NOT NULL AND v_actor.decays_at < now() + interval '30 days' THEN
      v_decay_score := 0.6;
    ELSIF v_actor.verified_at > now() - interval '90 days' THEN
      v_decay_score := 1.0;
    ELSE
      v_decay_score := 0.85;
    END IF;

    -- ----- Geography subscore -----
    v_geo_distance := NULL;
    v_geo_filter := NULL;
    IF v_center_lat IS NOT NULL AND v_center_lon IS NOT NULL AND v_radius_km IS NOT NULL
       AND v_actor.latitude IS NOT NULL AND v_actor.longitude IS NOT NULL THEN
      v_geo_distance := earth_distance(
        ll_to_earth(v_actor.latitude::float8, v_actor.longitude::float8),
        ll_to_earth(v_center_lat::float8, v_center_lon::float8)
      ) / 1000.0;
      v_geo_score := GREATEST(0, 1 - v_geo_distance / v_radius_km);
      v_geo_filter := format('radius=%skm', v_radius_km);
    ELSIF v_countries IS NOT NULL AND array_length(v_countries,1) > 0 THEN
      IF v_actor.country = ANY(v_countries) THEN
        v_geo_score := 1.0;
      ELSE
        v_geo_score := 0.0;
      END IF;
      v_geo_filter := 'country=' || array_to_string(v_countries, ',');
    ELSE
      v_geo_score := 0.5;
    END IF;

    -- ----- Capacity subscore -----
    v_cap_signals := '[]'::jsonb;
    v_cap_score := 0.5;
    v_cap_n := 0;

    IF v_min_team IS NOT NULL OR v_max_mob_days IS NOT NULL THEN
      v_cap_score := 0;

      -- team size
      IF v_min_team IS NOT NULL THEN
        v_cap_n := v_cap_n + 1;
        SELECT COALESCE(MAX(COALESCE(value_max, value_min)), NULL)
        INTO v_team_size
        FROM public.actor_capacity_attributes
        WHERE actor_id = v_aid AND attribute_type ILIKE '%team%';
        IF v_team_size IS NULL THEN
          v_cap_score := v_cap_score + 0.5;
        ELSIF v_team_size >= v_min_team THEN
          v_cap_score := v_cap_score + 1.0;
          v_cap_signals := v_cap_signals || jsonb_build_array(format('team_size>=%s (actual %s)', v_min_team, v_team_size));
        END IF;
      END IF;

      -- mobilization
      IF v_max_mob_days IS NOT NULL THEN
        v_cap_n := v_cap_n + 1;
        SELECT value_text INTO v_mob_text
        FROM public.actor_capacity_attributes
        WHERE actor_id = v_aid AND attribute_type ILIKE '%mobiliz%'
        ORDER BY created_at DESC LIMIT 1;
        IF v_mob_text IS NULL THEN
          v_cap_score := v_cap_score + 0.5;
        ELSE
          v_mob_days := CASE
            WHEN v_mob_text ILIKE '%immediate%' THEN 0
            WHEN v_mob_text ~* '24\s*h' THEN 1
            WHEN v_mob_text ~* '(\d+)\s*day' THEN (regexp_match(v_mob_text, '(\d+)\s*day','i'))[1]::numeric
            WHEN v_mob_text ~* '(\d+)\s*week' THEN (regexp_match(v_mob_text, '(\d+)\s*week','i'))[1]::numeric * 7
            WHEN v_mob_text ~* '(\d+)\s*month' THEN (regexp_match(v_mob_text, '(\d+)\s*month','i'))[1]::numeric * 30
            ELSE NULL
          END;
          IF v_mob_days IS NULL THEN
            v_cap_score := v_cap_score + 0.5;
          ELSIF v_mob_days <= v_max_mob_days THEN
            v_cap_score := v_cap_score + 1.0;
            v_cap_signals := v_cap_signals || jsonb_build_array(format('mobilization<=%sd (actual ~%sd)', v_max_mob_days, v_mob_days));
          END IF;
        END IF;
      END IF;

      IF v_cap_n > 0 THEN v_cap_score := v_cap_score / v_cap_n; END IF;
    END IF;

    -- ----- Certifications subscore -----
    v_cert_matched := '{}'::text[];
    v_cert_missing := '{}'::text[];
    v_cert_score := 0.5;

    IF (v_req_certs IS NOT NULL AND array_length(v_req_certs,1) > 0)
       OR (v_pref_certs IS NOT NULL AND array_length(v_pref_certs,1) > 0) THEN
      IF v_req_certs IS NOT NULL THEN
        SELECT array_agg(req) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.actor_standards s
          WHERE s.actor_id = v_aid
            AND (s.standard_name ILIKE req OR s.standard_number ILIKE req)
            AND (s.valid_to IS NULL OR s.valid_to > now()::date)
        )) INTO v_cert_matched
        FROM unnest(v_req_certs) AS req;
        SELECT array_agg(req) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM public.actor_standards s
          WHERE s.actor_id = v_aid
            AND (s.standard_name ILIKE req OR s.standard_number ILIKE req)
            AND (s.valid_to IS NULL OR s.valid_to > now()::date)
        )) INTO v_cert_missing
        FROM unnest(v_req_certs) AS req;
      END IF;

      IF v_cert_missing IS NOT NULL AND array_length(v_cert_missing,1) > 0 THEN
        v_cert_score := 0.0;
      ELSE
        v_cert_score := 0.7;
        IF v_pref_certs IS NOT NULL THEN
          SELECT COUNT(*) INTO v_present_pref
          FROM unnest(v_pref_certs) AS pref
          WHERE EXISTS (
            SELECT 1 FROM public.actor_standards s
            WHERE s.actor_id = v_aid
              AND (s.standard_name ILIKE pref OR s.standard_number ILIKE pref)
              AND (s.valid_to IS NULL OR s.valid_to > now()::date)
          );
          v_cert_score := LEAST(1.0, v_cert_score + 0.1 * v_present_pref);
        END IF;
      END IF;
    END IF;

    -- ----- Combine -----
    v_total := ROUND((
        w_ontology  * v_ontology_score
      + w_geography * v_geo_score
      + w_outcome   * v_outcome_score
      + w_decay     * v_decay_score
      + w_capacity  * v_cap_score
      + w_cert      * v_cert_score
    )::numeric, 4);

    v_breakdown := jsonb_build_object(
      'ontology', jsonb_build_object(
        'score', ROUND(v_ontology_score::numeric,4),
        'weight', w_ontology,
        'contrib', ROUND((w_ontology * v_ontology_score)::numeric,4),
        'matched_tags', v_matched_tags,
        'inherited_tags', v_inherited_tags
      ),
      'outcome', jsonb_build_object(
        'score', v_outcome_score,
        'weight', w_outcome,
        'contrib', ROUND((w_outcome * v_outcome_score)::numeric,4),
        'outcome_count', v_outcome_count,
        'modifier', ROUND(v_outcome_modifier::numeric,3)
      ),
      'decay', jsonb_build_object(
        'score', v_decay_score,
        'weight', w_decay,
        'contrib', ROUND((w_decay * v_decay_score)::numeric,4),
        'verified_at', v_actor.verified_at,
        'decays_at', v_actor.decays_at
      ),
      'geography', jsonb_build_object(
        'score', ROUND(v_geo_score::numeric,4),
        'weight', w_geography,
        'contrib', ROUND((w_geography * v_geo_score)::numeric,4),
        'distance_km', v_geo_distance,
        'filter', v_geo_filter
      ),
      'capacity', jsonb_build_object(
        'score', ROUND(v_cap_score::numeric,4),
        'weight', w_capacity,
        'contrib', ROUND((w_capacity * v_cap_score)::numeric,4),
        'matched_signals', v_cap_signals
      ),
      'certification', jsonb_build_object(
        'score', v_cert_score,
        'weight', w_cert,
        'contrib', ROUND((w_cert * v_cert_score)::numeric,4),
        'matched', to_jsonb(COALESCE(v_cert_matched,'{}'::text[])),
        'missing', to_jsonb(COALESCE(v_cert_missing,'{}'::text[]))
      ),
      'group_rollup', jsonb_build_object(
        'score', CASE WHEN jsonb_array_length(v_inherited_tags) > 0 THEN 0.6 ELSE 0 END,
        'weight', 0,
        'contrib', 0,
        'via_parent', v_group_parent,
        'inherited_count', jsonb_array_length(v_inherited_tags)
      ),
      'engagement', jsonb_build_object(
        'score', 0, 'weight', 0, 'contrib', 0, 'note', 'AX4 will populate'
      )
    );

    actor_id := v_aid;
    total_score := v_total;
    breakdown := v_breakdown;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_compute_actor_relevance_score_v2(uuid[], jsonb, jsonb) TO authenticated, anon, service_role;
