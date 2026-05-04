REVOKE EXECUTE ON FUNCTION public.fn_verify_actor(uuid, jsonb, timestamptz, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_approve_and_verify(uuid, jsonb, timestamptz, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_reject_suggestion(uuid, text, uuid) FROM PUBLIC;