CREATE OR REPLACE FUNCTION public.fn_p36_diagnostic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_claims_raw text := current_setting('request.jwt.claims', true);
  v_session_user text := session_user;
  v_current_user text := current_user;
  v_current_role text := current_setting('role', true);
  v_inserted_id uuid;
  v_error_code text;
  v_error_msg text;
BEGIN
  RAISE NOTICE 'p36_diag: auth.uid()=%, session_user=%, current_user=%, role=%',
    v_uid, v_session_user, v_current_user, v_current_role;

  BEGIN
    INSERT INTO public.programmes (name, owner_user_id)
    VALUES ('p36-diagnostic-test-' || extract(epoch from now())::text, v_uid)
    RETURNING id INTO v_inserted_id;

    DELETE FROM public.programmes WHERE id = v_inserted_id;

    RETURN jsonb_build_object(
      'context', jsonb_build_object(
        'auth_uid', v_uid,
        'session_user', v_session_user,
        'current_user', v_current_user,
        'current_role', v_current_role,
        'jwt_claims_raw', v_jwt_claims_raw
      ),
      'insert', jsonb_build_object(
        'result', 'success',
        'inserted_id', v_inserted_id,
        'cleaned_up', true,
        'note', 'INSERT passed WITH CHECK; row inserted then immediately deleted.'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_code := SQLSTATE;
    v_error_msg := SQLERRM;
    RETURN jsonb_build_object(
      'context', jsonb_build_object(
        'auth_uid', v_uid,
        'session_user', v_session_user,
        'current_user', v_current_user,
        'current_role', v_current_role,
        'jwt_claims_raw', v_jwt_claims_raw
      ),
      'insert', jsonb_build_object(
        'result', 'failure',
        'sqlstate', v_error_code,
        'sqlerrm', v_error_msg,
        'note', 'INSERT was rejected — same plumbing path as the parked direct-INSERT bug.'
      )
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_p36_diagnostic() TO authenticated;