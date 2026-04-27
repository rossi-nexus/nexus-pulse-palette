-- Atomic suggest-for-database operation (closes audit M8 / P29).
-- Wraps the two writes (UPDATE personal actor status + INSERT into validation queue)
-- in a single transaction so partial failure cannot leave the user in a stuck state.
-- SECURITY INVOKER: runs with the calling user's permissions, so existing RLS
-- policies on user_personal_actors (UPDATE: own + status != 'merged') and
-- actor_validation_queue (INSERT: suggested_by = auth.uid()) gate the writes.

CREATE OR REPLACE FUNCTION public.fn_suggest_actor(p_personal_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_queue_id uuid;
  v_actor_owner uuid;
  v_actor_status text;
BEGIN
  -- Snapshot the actor state we're about to mutate.
  -- This SELECT is gated by RLS. If the user doesn't own the actor, this returns
  -- zero rows and the function raises 'actor_not_found_or_not_owned'.
  SELECT user_id, status
  INTO v_actor_owner, v_actor_status
  FROM public.user_personal_actors
  WHERE id = p_personal_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_not_found_or_not_owned'
      USING HINT = 'The personal actor does not exist or you do not have access.';
  END IF;

  IF v_actor_status = 'suggested' THEN
    RAISE EXCEPTION 'actor_already_suggested'
      USING HINT = 'This actor has already been suggested for the main database.';
  END IF;

  IF v_actor_status = 'merged' THEN
    RAISE EXCEPTION 'actor_already_merged'
      USING HINT = 'This actor has already been merged into the main database.';
  END IF;

  -- Update personal actor status. RLS-gated; will fail closed if anything is wrong.
  UPDATE public.user_personal_actors
  SET status = 'suggested',
      suggested_at = now()
  WHERE id = p_personal_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_update_failed'
      USING HINT = 'The status update did not affect any row. Check RLS policy.';
  END IF;

  -- Insert into validation queue. RLS-gated.
  -- Column shape matches the existing frontend INSERT in useActorActions.suggestForDb:
  --   user_personal_actor_id, suggested_by, status='pending'.
  -- suggested_by is sourced from auth.uid() so it matches the RLS check
  -- (with check: auth.uid() = suggested_by) and cannot be spoofed.
  INSERT INTO public.actor_validation_queue (
    user_personal_actor_id,
    suggested_by,
    status
  )
  VALUES (
    p_personal_actor_id,
    auth.uid(),
    'pending'
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$func$;

COMMENT ON FUNCTION public.fn_suggest_actor(uuid) IS
  'Atomically marks a personal actor as suggested and inserts it into the validation queue. SECURITY INVOKER: relies on existing RLS policies. Closes audit finding M8 / P29.';

-- Allow authenticated users to call the function. RLS on the underlying
-- tables provides the actual access control.
GRANT EXECUTE ON FUNCTION public.fn_suggest_actor(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_suggest_actor(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_suggest_actor(uuid) FROM public;