
CREATE OR REPLACE FUNCTION public.fn_suggest_role_for_summary_point(
  p_summary_point text,
  p_existing_role_names text[] DEFAULT '{}'::text[]
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $func$
DECLARE
  v_lower text := lower(coalesce(p_summary_point, ''));
  v_existing text := lower(array_to_string(coalesce(p_existing_role_names, '{}'::text[]), ' || '));
  v_candidate text;
BEGIN
  -- v1: deterministic rules-based mapping. Cover the obvious procurement +
  -- preparedness/defence keywords; fall back to a generic "Specialist" label.
  v_candidate := CASE
    WHEN v_lower ~ '(framework|procure|tender|contract|award)' THEN 'Procurement specialist'
    WHEN v_lower ~ '(maintenance|service|logist|supply|sustain)' THEN 'Sustainment provider'
    WHEN v_lower ~ '(train|exercise|drill|simulat)' THEN 'Training provider'
    WHEN v_lower ~ '(integration|integrator|systems)' THEN 'Systems integrator'
    WHEN v_lower ~ '(intel|surveil|recon|isr)' THEN 'ISR specialist'
    WHEN v_lower ~ '(cyber|infosec|information security)' THEN 'Cybersecurity provider'
    WHEN v_lower ~ '(uav|drone|unmanned)' THEN 'UAS specialist'
    WHEN v_lower ~ '(medical|emergency|response|preparedness)' THEN 'Emergency response provider'
    WHEN v_lower ~ '(infrastructure|construction|engineer)' THEN 'Infrastructure specialist'
    WHEN v_lower ~ '(consult|advisor|advis)' THEN 'Subject matter advisor'
    ELSE 'Specialist provider'
  END;

  -- If the suggestion already exists in the role list, fall back to a generic.
  IF position(lower(v_candidate) IN v_existing) > 0 THEN
    v_candidate := 'Specialist provider';
  END IF;

  RETURN v_candidate;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_suggest_role_for_summary_point(text, text[]) TO authenticated;
