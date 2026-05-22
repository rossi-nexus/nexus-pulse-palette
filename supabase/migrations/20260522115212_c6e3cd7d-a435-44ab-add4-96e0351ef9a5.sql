CREATE OR REPLACE FUNCTION public.fn_actors_for_map()
RETURNS TABLE (
  id uuid,
  legal_name text,
  country text,
  city text,
  latitude numeric,
  longitude numeric,
  geocoded_precision text,
  verification_status text,
  verified_at timestamptz,
  decays_at timestamptz,
  primary_domain_name text,
  primary_domain_category text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $func$
  SELECT
    a.id,
    a.legal_name,
    a.country,
    a.city,
    a.latitude,
    a.longitude,
    a.geocoded_precision,
    a.verification_status,
    a.verified_at,
    a.decays_at,
    oe.raw_name AS primary_domain_name,
    oc.normalized_name AS primary_domain_category
  FROM public.actors a
  LEFT JOIN LATERAL (
    SELECT aot.ontology_entry_id, aot.created_at
    FROM public.actor_ontology_tags aot
    JOIN public.ontology_entries oe2 ON oe2.id = aot.ontology_entry_id
    JOIN public.ontology_categories oc2 ON oc2.id = oe2.category_id
    WHERE aot.actor_id = a.id
      AND oc2.type = 'domain'
      AND oe2.status = 'active'
    ORDER BY aot.created_at ASC
    LIMIT 1
  ) primary_tag ON TRUE
  LEFT JOIN public.ontology_entries oe ON oe.id = primary_tag.ontology_entry_id
  LEFT JOIN public.ontology_categories oc ON oc.id = oe.category_id;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_actors_for_map() TO authenticated;