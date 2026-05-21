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
  overlap_count int,
  matched_entry_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    COUNT(t.id)::int AS overlap_count,
    array_agg(DISTINCT t.ontology_entry_id) AS matched_entry_ids
  FROM public.actors a
  JOIN public.actor_ontology_tags t ON t.actor_id = a.id
  WHERE t.ontology_entry_id = ANY(p_entry_ids)
    AND a.verification_status = 'verified'
  GROUP BY a.id
  ORDER BY COUNT(t.id) DESC, a.verified_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
$$;