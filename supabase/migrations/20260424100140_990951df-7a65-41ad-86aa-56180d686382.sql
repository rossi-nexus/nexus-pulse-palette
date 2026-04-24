
-- Phase 6B.6: tighten RLS for personal actor actions and open validation queue inserts for owners

-- USER_PERSONAL_ACTORS ---------------------------------------------------------

-- Drop overlapping policies so we can replace with explicit per-command rules.
DROP POLICY IF EXISTS "Own personal actors" ON public.user_personal_actors;
DROP POLICY IF EXISTS "Users can view own personal actors" ON public.user_personal_actors;
DROP POLICY IF EXISTS "Users can insert own personal actors" ON public.user_personal_actors;
DROP POLICY IF EXISTS "Users can update own personal actors" ON public.user_personal_actors;

-- SELECT: owner or admin
CREATE POLICY "Users can view own personal actors"
  ON public.user_personal_actors
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR public.is_admin(auth.uid()));

-- INSERT: only as oneself (admins can insert via separate admin policy below)
CREATE POLICY "Users can insert own personal actors"
  ON public.user_personal_actors
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: owner, but NOT once status = 'merged' (locked into main DB)
CREATE POLICY "Users can update own non-merged personal actors"
  ON public.user_personal_actors
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status <> 'merged')
  WITH CHECK (auth.uid() = user_id AND status <> 'merged');

-- DELETE: owner, but NOT once status = 'merged'
CREATE POLICY "Users can delete own non-merged personal actors"
  ON public.user_personal_actors
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND status <> 'merged');

-- Admin full access (mirrors the previous ALL policy for admins)
CREATE POLICY "Admins manage personal actors"
  ON public.user_personal_actors
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ACTOR_VALIDATION_QUEUE -------------------------------------------------------

-- Keep existing admin ALL policy. Add explicit user policies:
-- Owners can INSERT a queue row for themselves
CREATE POLICY "Users can insert own validation queue rows"
  ON public.actor_validation_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = suggested_by);

-- Owners can SELECT their own queue rows (to see status)
CREATE POLICY "Users can view own validation queue rows"
  ON public.actor_validation_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = suggested_by);

-- No user UPDATE / DELETE policies — append-only from user side. Admins continue to have full access via the existing "Admin validation queue" policy.
