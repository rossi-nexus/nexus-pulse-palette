-- AX5: drop v1 RPC, add GIST geo index, extend user_preferences with onboarding flag.

-- 1. Drop v1 ranking RPC. v2 is fully wired (useSearch + SavedSearchesPage call only v2).
DROP FUNCTION IF EXISTS public.fn_compute_actor_relevance_score(uuid, uuid, uuid[]);

-- 2. Functional GIST index for fast radius queries on actors. Cheap on small tables;
--    future-proofs once we cross 100k rows. earthdistance + cube were enabled in AX2.
CREATE INDEX IF NOT EXISTS idx_actors_earth_location
  ON public.actors USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 3. Add onboarding_seen jsonb to user_preferences so first-run tours can persist dismissal.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS onboarding_seen jsonb NOT NULL DEFAULT '{}'::jsonb;