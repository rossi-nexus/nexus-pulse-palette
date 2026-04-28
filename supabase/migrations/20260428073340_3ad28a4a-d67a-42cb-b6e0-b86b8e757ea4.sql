-- =====================================================================
-- Phase 6.5.1 — ABAC Foundation
-- =====================================================================

-- ---------------------------------------------------------------------
-- Step 1: user_attributes table
-- ---------------------------------------------------------------------
CREATE TABLE public.user_attributes (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  granted_by uuid REFERENCES public.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX idx_user_attributes_user_key ON public.user_attributes(user_id, key);

ALTER TABLE public.user_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own attributes"
  ON public.user_attributes FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins write attributes"
  ON public.user_attributes FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- Step 2: Helper functions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_user_has_attr(_uid uuid, _key text, _value text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.user_attributes
    WHERE user_id = _uid
      AND key = _key
      AND (_value IS NULL OR value = _value)
      AND (expires_at IS NULL OR expires_at > now())
  );
$func$;

-- DEPRECATED: get_user_tier() is a compatibility shim derived from ABAC attributes.
-- It and users.access_tier will be removed in a future sub-phase. Do not add new callers.
CREATE OR REPLACE FUNCTION public.get_user_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT CASE
    WHEN public.fn_user_has_attr(_user_id, 'actors:visibility', 'all') THEN 'tier_1'
    ELSE 'tier_3'
  END;
$func$;

-- ---------------------------------------------------------------------
-- Step 3: Auth trigger (closes P35)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  INSERT INTO public.users (id, email, name, role, access_tier)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    'user',
    'tier_3'
  )
  ON CONFLICT (id) DO NOTHING;
  -- New users default to verified-only visibility (equivalent to old tier_3).
  -- They do NOT receive actors:visibility='all'. Admins grant elevated
  -- attributes explicitly via the consultant workspace (post-6.5.5b) or DB.
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- Step 4: Rename actor_classifications -> actor_certifications
-- ---------------------------------------------------------------------
ALTER TABLE public.actor_classifications RENAME TO actor_certifications;

-- Policies follow the rename (Postgres tracks by OID), but we rename them
-- for clarity to avoid stale names referring to the new table.
ALTER POLICY "Read actor_classifications" ON public.actor_certifications
  RENAME TO "Read actor_certifications";
ALTER POLICY "Admin manage actor_classifications" ON public.actor_certifications
  RENAME TO "Admin manage actor_certifications";

-- NOTE: actor_certifications.confidence CHECK constraint remains uppercase
-- ('HIGH'|'MEDIUM'|'LOW') intentionally. 6.5.3a (verification lifecycle)
-- handles the lowercase migration when adding verified_at/decays_at columns.

-- ---------------------------------------------------------------------
-- Step 5: Drop users.is_anonymous (dormant)
-- ---------------------------------------------------------------------
ALTER TABLE public.users DROP COLUMN IF EXISTS is_anonymous;

-- ---------------------------------------------------------------------
-- Step 6: Drop user_personal_actors.sharing_level (dormant)
-- ---------------------------------------------------------------------
ALTER TABLE public.user_personal_actors DROP CONSTRAINT IF EXISTS user_personal_actors_sharing_level_check;
ALTER TABLE public.user_personal_actors DROP COLUMN IF EXISTS sharing_level;

-- ---------------------------------------------------------------------
-- Step 7: ABAC RLS policies on actors
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "T1 read all actors" ON public.actors;
DROP POLICY IF EXISTS "T2 read all actors" ON public.actors;
DROP POLICY IF EXISTS "T3 read verified actors" ON public.actors;

CREATE POLICY "Full visibility read all actors"
  ON public.actors FOR SELECT
  TO authenticated
  USING (public.fn_user_has_attr(auth.uid(), 'actors:visibility', 'all'));

CREATE POLICY "All authenticated read admin-verified actors"
  ON public.actors FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND verification_status = 'admin_verified');

-- ---------------------------------------------------------------------
-- Step 8: Backfill attributes for existing users
-- ---------------------------------------------------------------------
INSERT INTO public.user_attributes (user_id, key, value)
SELECT id, 'actors:visibility', 'all'
FROM public.users
WHERE access_tier IN ('tier_1', 'tier_2')
ON CONFLICT (user_id, key) DO NOTHING;

INSERT INTO public.user_attributes (user_id, key, value)
SELECT id, 'actors:visibility', 'all'
FROM public.users
WHERE role = 'admin'
ON CONFLICT (user_id, key) DO NOTHING;