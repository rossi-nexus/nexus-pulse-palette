CREATE OR REPLACE FUNCTION public.fn_compute_actor_relevance_score(
  p_actor_id uuid,
  p_role_id uuid DEFAULT NULL,
  p_ontology_entry_ids uuid[] DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $func$
DECLARE
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
  v_outcome_row_count integer := 0;
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

  -- AX pre-AX2 diagnostic canary (Fix 1).
  -- Behavioural no-op: only emits a WARNING when the modifier is the
  -- default but outcome rows exist for this actor. Remove together with
  -- the AX3a outcome-type alignment.
  IF v_outcome_modifier = 1.0 THEN
    SELECT count(*) INTO v_outcome_row_count
    FROM public.programme_outcomes
    WHERE actor_id = p_actor_id;
    IF v_outcome_row_count >= 1 THEN
      RAISE WARNING 'AX pre-AX2: outcome modifier 1.0 for actor % despite % outcome row(s) - likely outcome_type string mismatch, see AX3a',
        p_actor_id, v_outcome_row_count;
    END IF;
  END IF;

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