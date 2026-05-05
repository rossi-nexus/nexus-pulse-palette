CREATE OR REPLACE FUNCTION public.whoami_diagnostic()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT jsonb_build_object(
    'auth_uid',                 auth.uid(),
    'jwt_claim_sub',            current_setting('request.jwt.claim.sub', true),
    'jwt_claim_role',           current_setting('request.jwt.claim.role', true),
    'jwt_claim_email',          current_setting('request.jwt.claim.email', true),
    'jwt_claims_full',          current_setting('request.jwt.claims', true),
    'session_user',             session_user,
    'current_user',             current_user,
    'current_role',             current_setting('role', true),
    'now',                      now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.whoami_diagnostic() TO authenticated;