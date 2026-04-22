-- Drop the FK constraint that blocks user writes
ALTER TABLE public.user_personal_actors
  DROP CONSTRAINT IF EXISTS user_personal_actors_actor_id_fkey;

-- Drop old actor_id column (no longer needed — we denormalize)
ALTER TABLE public.user_personal_actors
  DROP COLUMN IF EXISTS actor_id;

-- Add denormalized actor identity fields
ALTER TABLE public.user_personal_actors
  ADD COLUMN IF NOT EXISTS actor_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS actor_website TEXT,
  ADD COLUMN IF NOT EXISTS actor_description TEXT,
  ADD COLUMN IF NOT EXISTS actor_type TEXT DEFAULT 'commercial',
  ADD COLUMN IF NOT EXISTS country TEXT;

-- Add source tracking fields
ALTER TABLE public.user_personal_actors
  ADD COLUMN IF NOT EXISTS source_session_id UUID,
  ADD COLUMN IF NOT EXISTS source_step TEXT DEFAULT 'search',
  ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 20;

-- Add CHECK constraints for the new enum-like fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_personal_actors_source_step_check'
  ) THEN
    ALTER TABLE public.user_personal_actors
      ADD CONSTRAINT user_personal_actors_source_step_check
      CHECK (source_step IN ('search', 'analysis', 'manual'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_personal_actors_profile_completeness_check'
  ) THEN
    ALTER TABLE public.user_personal_actors
      ADD CONSTRAINT user_personal_actors_profile_completeness_check
      CHECK (profile_completeness BETWEEN 0 AND 100);
  END IF;
END $$;

-- Add data snapshot fields (JSONB)
ALTER TABLE public.user_personal_actors
  ADD COLUMN IF NOT EXISTS search_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis_data JSONB DEFAULT '{}'::jsonb;

-- Add role and source context
ALTER TABLE public.user_personal_actors
  ADD COLUMN IF NOT EXISTS role_names TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_urls TEXT[] DEFAULT '{}';

-- Add DB matching fields (FK to actors is fine — read reference only)
ALTER TABLE public.user_personal_actors
  ADD COLUMN IF NOT EXISTS matched_main_db_actor_id UUID REFERENCES public.actors(id),
  ADD COLUMN IF NOT EXISTS match_timestamp TIMESTAMPTZ;

-- Add sharing_level
ALTER TABLE public.user_personal_actors
  ADD COLUMN IF NOT EXISTS sharing_level TEXT DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_personal_actors_sharing_level_check'
  ) THEN
    ALTER TABLE public.user_personal_actors
      ADD CONSTRAINT user_personal_actors_sharing_level_check
      CHECK (sharing_level IN ('private', 'shared'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_personal_actors_status_check'
  ) THEN
    ALTER TABLE public.user_personal_actors
      ADD CONSTRAINT user_personal_actors_status_check
      CHECK (status IN ('personal', 'suggested', 'merged'));
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.user_personal_actors ENABLE ROW LEVEL SECURITY;

-- Recreate clean per-action policies (existing "Own personal actors" stays as admin/owner ALL)
DROP POLICY IF EXISTS "Users can view own personal actors" ON public.user_personal_actors;
DROP POLICY IF EXISTS "Users can insert own personal actors" ON public.user_personal_actors;
DROP POLICY IF EXISTS "Users can update own personal actors" ON public.user_personal_actors;

CREATE POLICY "Users can view own personal actors"
  ON public.user_personal_actors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own personal actors"
  ON public.user_personal_actors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personal actors"
  ON public.user_personal_actors FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_personal_actors_user ON public.user_personal_actors(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_actors_session ON public.user_personal_actors(source_session_id);