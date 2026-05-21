DROP POLICY IF EXISTS "All authenticated read admin-verified actors" ON public.actors;

CREATE POLICY "All authenticated read verified actors"
  ON public.actors
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND verification_status = 'verified');