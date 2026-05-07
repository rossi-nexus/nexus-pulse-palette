-- ABAC retrofit
ALTER TABLE public.search_analytics
  ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.programmes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_search_analytics_programme
  ON public.search_analytics(programme_id) WHERE programme_id IS NOT NULL;

DROP POLICY IF EXISTS "Programme members read scoped analytics" ON public.search_analytics;
CREATE POLICY "Programme members read scoped analytics"
  ON public.search_analytics FOR SELECT
  USING (
    programme_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = search_analytics.programme_id
        AND pm.user_id = auth.uid()
    )
  );

ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.programmes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intelligence_items_programme
  ON public.intelligence_items(programme_id) WHERE programme_id IS NOT NULL;

DROP POLICY IF EXISTS "Programme members read scoped intelligence" ON public.intelligence_items;
CREATE POLICY "Programme members read scoped intelligence"
  ON public.intelligence_items FOR SELECT
  USING (
    programme_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = intelligence_items.programme_id
        AND pm.user_id = auth.uid()
    )
  );

-- Programme summary helper
CREATE OR REPLACE FUNCTION public.fn_programme_summary(p_programme_id uuid)
RETURNS TABLE (
  session_count int,
  member_count int,
  verified_actor_count int,
  pending_suggestion_count int,
  decay_warning_count int
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $func$
  SELECT
    (SELECT count(*)::int FROM public.search_sessions WHERE programme_id = p_programme_id),
    (SELECT count(*)::int FROM public.programme_members WHERE programme_id = p_programme_id),
    (SELECT count(DISTINCT actor_id)::int FROM public.verification_events
       WHERE programme_id = p_programme_id AND verification_status = 'complete'),
    (SELECT count(*)::int FROM public.actor_validation_queue avq
       JOIN public.user_personal_actors upa ON upa.id = avq.user_personal_actor_id
       JOIN public.search_sessions ss ON ss.id = upa.source_session_id
       WHERE ss.programme_id = p_programme_id AND avq.status = 'pending'),
    (SELECT count(*)::int FROM public.actors a
       JOIN public.verification_events ve ON ve.actor_id = a.id
       WHERE ve.programme_id = p_programme_id
         AND a.decays_at IS NOT NULL
         AND a.decays_at <= now() + interval '30 days');
$func$;

GRANT EXECUTE ON FUNCTION public.fn_programme_summary(uuid) TO authenticated;