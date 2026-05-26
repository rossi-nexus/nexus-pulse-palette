CREATE TABLE public.consultant_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('queue', 'actor', 'fresh_onboarding')),
  target_id uuid,
  client_session_id text,
  draft_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultant_drafts_target_check CHECK (
    (target_type IN ('queue', 'actor') AND target_id IS NOT NULL AND client_session_id IS NULL)
    OR
    (target_type = 'fresh_onboarding' AND target_id IS NULL AND client_session_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX consultant_drafts_unique_target
  ON public.consultant_drafts (user_id, target_type, COALESCE(target_id::text, ''), COALESCE(client_session_id, ''));

ALTER TABLE public.consultant_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own drafts" ON public.consultant_drafts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own drafts" ON public.consultant_drafts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own drafts" ON public.consultant_drafts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own drafts" ON public.consultant_drafts FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Admins read all drafts" ON public.consultant_drafts FOR SELECT USING (public.is_admin(auth.uid()));

CREATE INDEX idx_consultant_drafts_user_updated ON public.consultant_drafts (user_id, updated_at DESC);

-- Auto-bump updated_at
CREATE TRIGGER trg_consultant_drafts_updated_at
  BEFORE UPDATE ON public.consultant_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin-callable TTL cleanup
CREATE OR REPLACE FUNCTION public.fn_cleanup_old_drafts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM public.consultant_drafts WHERE updated_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_cleanup_old_drafts() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_old_drafts() TO authenticated;