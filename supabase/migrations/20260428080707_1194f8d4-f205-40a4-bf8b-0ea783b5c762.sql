
-- Step 1: programmes table
CREATE TABLE public.programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  client_org text,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  started_at timestamptz,
  ended_at timestamptz,
  deliverables_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_programmes_owner ON public.programmes(owner_user_id);
CREATE INDEX idx_programmes_status ON public.programmes(status);

CREATE TRIGGER programmes_set_updated_at
  BEFORE UPDATE ON public.programmes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

-- Step 2: programme_members table
CREATE TABLE public.programme_members (
  programme_id uuid NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'consultant', 'viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid REFERENCES public.users(id),
  PRIMARY KEY (programme_id, user_id)
);

CREATE INDEX idx_programme_members_user ON public.programme_members(user_id);
CREATE INDEX idx_programme_members_programme ON public.programme_members(programme_id);

ALTER TABLE public.programme_members ENABLE ROW LEVEL SECURITY;

-- Step 3: auto-add-owner trigger
CREATE OR REPLACE FUNCTION public.fn_programme_add_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  INSERT INTO public.programme_members (programme_id, user_id, role, joined_at, invited_by)
  VALUES (NEW.id, NEW.owner_user_id, 'owner', now(), NEW.owner_user_id)
  ON CONFLICT (programme_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER programmes_auto_add_owner
  AFTER INSERT ON public.programmes
  FOR EACH ROW EXECUTE FUNCTION public.fn_programme_add_owner_member();

-- Step 4: RLS on programmes
CREATE POLICY "Members read own programmes"
  ON public.programmes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programmes.id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated create programmes"
  ON public.programmes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_user_id);

CREATE POLICY "Owner updates programmes"
  ON public.programmes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programmes.id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

CREATE POLICY "Owner deletes programmes"
  ON public.programmes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programmes.id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

-- Step 5: RLS on programme_members
CREATE POLICY "Members read co-members"
  ON public.programme_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programme_members.programme_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner adds members"
  ON public.programme_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programme_members.programme_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

CREATE POLICY "Owner updates members"
  ON public.programme_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programme_members.programme_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

CREATE POLICY "Owner removes members or self-leave"
  ON public.programme_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = programme_members.programme_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
    OR (programme_members.user_id = auth.uid() AND programme_members.role != 'owner')
  );

-- Step 6: rename project_id -> programme_id, add FK
ALTER TABLE public.search_sessions RENAME COLUMN project_id TO programme_id;

ALTER TABLE public.search_sessions
  ADD CONSTRAINT search_sessions_programme_id_fkey
  FOREIGN KEY (programme_id) REFERENCES public.programmes(id) ON DELETE SET NULL;

CREATE INDEX idx_search_sessions_programme ON public.search_sessions(programme_id);

-- Step 7: rewrite search_sessions RLS to add programme-membership read branch
DROP POLICY IF EXISTS "Own sessions access" ON public.search_sessions;

CREATE POLICY "Users read own or programme sessions"
  ON public.search_sessions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR (
      programme_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.programme_members pm
        WHERE pm.programme_id = search_sessions.programme_id
          AND pm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users manage own sessions"
  ON public.search_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users update own sessions"
  ON public.search_sessions FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users delete own sessions"
  ON public.search_sessions FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Step 8: cascade RLS rewrites for session_step_states + session_actors
DROP POLICY IF EXISTS "Own step states access" ON public.session_step_states;

CREATE POLICY "Read step states for own or programme sessions"
  ON public.session_step_states FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_step_states.session_id
        AND (
          s.user_id = auth.uid()
          OR public.is_admin(auth.uid())
          OR (
            s.programme_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.programme_members pm
              WHERE pm.programme_id = s.programme_id
                AND pm.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "Write step states for own sessions"
  ON public.session_step_states FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_step_states.session_id
        AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Update step states for own sessions"
  ON public.session_step_states FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_step_states.session_id
        AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Delete step states for own sessions"
  ON public.session_step_states FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_step_states.session_id
        AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Own session actors access" ON public.session_actors;

CREATE POLICY "Read session actors for own or programme sessions"
  ON public.session_actors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_actors.session_id
        AND (
          s.user_id = auth.uid()
          OR public.is_admin(auth.uid())
          OR (
            s.programme_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.programme_members pm
              WHERE pm.programme_id = s.programme_id
                AND pm.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "Write session actors for own sessions"
  ON public.session_actors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_actors.session_id
        AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Update session actors for own sessions"
  ON public.session_actors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_actors.session_id
        AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Delete session actors for own sessions"
  ON public.session_actors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.search_sessions s
      WHERE s.id = session_actors.session_id
        AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );
