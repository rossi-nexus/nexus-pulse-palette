CREATE TABLE public.user_notification_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification state"
  ON public.user_notification_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own notification state"
  ON public.user_notification_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notification state"
  ON public.user_notification_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all notification state"
  ON public.user_notification_state FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users read events where they are the acting user"
  ON public.audit_log FOR SELECT
  USING (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_notifications_decay_for_me(
  _within interval DEFAULT '30 days'
)
RETURNS TABLE (
  actor_id uuid,
  legal_name text,
  verified_at timestamptz,
  decays_at timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT a.id, a.legal_name, a.verified_at, a.decays_at,
    CASE WHEN a.decays_at < now() THEN 'expired' ELSE 'decay_warning' END AS state
  FROM public.actors a
  WHERE a.verifier_id = v_uid
    AND a.decays_at IS NOT NULL
    AND a.decays_at < now() + _within
  ORDER BY a.decays_at ASC;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_notifications_decay_for_me(interval) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_notifications_decay_for_me(interval) TO authenticated;