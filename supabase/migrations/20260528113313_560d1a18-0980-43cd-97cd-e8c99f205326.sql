
DROP FUNCTION IF EXISTS public.fn_rank_actors_by_ontology_overlap(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_rank_actors_by_ontology_overlap(
  p_entry_ids uuid[],
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  actor_id uuid,
  legal_name text,
  websites text[],
  country text,
  city text,
  region text,
  verification_status text,
  verified_at timestamptz,
  decays_at timestamptz,
  overlap_count numeric,
  matched_entry_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- v2: weight overlap by tag confidence.
  --   high=1.0, medium=0.7, low=0.4, null=0.5
  SELECT
    a.id,
    a.legal_name,
    a.websites,
    a.country,
    a.city,
    a.region,
    a.verification_status,
    a.verified_at,
    a.decays_at,
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
  GROUP BY a.id
  ORDER BY SUM(
    CASE t.confidence
      WHEN 'high'   THEN 1.0
      WHEN 'medium' THEN 0.7
      WHEN 'low'    THEN 0.4
      ELSE 0.5
    END
  ) DESC, a.verified_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.fn_rank_actors_by_ontology_overlap(uuid[], integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_compute_actor_relevance_score(
  p_actor_id uuid,
  p_role_id uuid DEFAULT NULL,
  p_ontology_entry_ids uuid[] DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $func$
DECLARE
  -- v1 tuning constants — adjust here as consultant feedback arrives.
  c_base_default        constant numeric := 0.5;
  c_overlap_floor       constant numeric := 0.3;
  c_outcome_weight      constant numeric := 0.3;
  c_outcome_min         constant numeric := 0.5;
  c_outcome_max         constant numeric := 1.5;
  c_unverified_mod      constant numeric := 0.8;
  c_decayed_mod         constant numeric := 0.6;
  c_near_decay_mod      constant numeric := 0.85;
  c_recent_mod          constant numeric := 1.15;
  v_base_score numeric := c_base_default;
  v_outcome_modifier numeric := 1.0;
  v_decay_modifier numeric := 1.0;
  v_overlap_score numeric := 0.0;
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

  SELECT 1.0 + (c_outcome_weight * COALESCE(SUM(
    CASE
      WHEN outcome_type IN ('delivered', 'success', 'awarded')
        THEN 1.0 / (1 + EXTRACT(EPOCH FROM (now() - COALESCE(po.completed_at, po.recorded_at))) / (86400 * 365))
      WHEN outcome_type IN ('failed', 'rejected')
        THEN -0.5 / (1 + EXTRACT(EPOCH FROM (now() - COALESCE(po.completed_at, po.recorded_at))) / (86400 * 365))
      ELSE 0
    END
  ), 0))
  INTO v_outcome_modifier
  FROM public.programme_outcomes po
  WHERE po.actor_id = p_actor_id;
  v_outcome_modifier := GREATEST(c_outcome_min, LEAST(c_outcome_max, v_outcome_modifier));

  SELECT
    CASE
      WHEN verified_at IS NULL THEN c_unverified_mod
      WHEN decays_at IS NOT NULL AND decays_at < now() THEN c_decayed_mod
      WHEN decays_at IS NOT NULL AND decays_at < now() + interval '30 days' THEN c_near_decay_mod
      WHEN verified_at > now() - interval '90 days' THEN c_recent_mod
      ELSE 1.0
    END
  INTO v_decay_modifier
  FROM public.actors WHERE id = p_actor_id;
  v_decay_modifier := COALESCE(v_decay_modifier, c_unverified_mod);

  RETURN LEAST(1.0, GREATEST(0.0, v_base_score * v_outcome_modifier * v_decay_modifier));
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_compute_actor_relevance_score(uuid, uuid, uuid[]) TO authenticated;
