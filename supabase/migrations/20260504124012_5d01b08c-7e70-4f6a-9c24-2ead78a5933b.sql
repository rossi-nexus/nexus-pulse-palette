-- Step 1: SECURITY DEFINER helpers that bypass RLS to break recursion
CREATE OR REPLACE FUNCTION public.fn_user_is_programme_member(
  _uid uuid,
  _programme_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.programme_members
    WHERE user_id = _uid AND programme_id = _programme_id
  );
$func$;

CREATE OR REPLACE FUNCTION public.fn_user_is_programme_owner(
  _uid uuid,
  _programme_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.programme_members
    WHERE user_id = _uid AND programme_id = _programme_id AND role = 'owner'
  );
$func$;

GRANT EXECUTE ON FUNCTION public.fn_user_is_programme_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_programme_owner(uuid, uuid) TO authenticated;

-- Step 2: drop recursive policies and replace with helper-based versions
DROP POLICY IF EXISTS "Members read co-members" ON public.programme_members;
DROP POLICY IF EXISTS "Owner adds members" ON public.programme_members;
DROP POLICY IF EXISTS "Owner updates members" ON public.programme_members;
DROP POLICY IF EXISTS "Owner removes members or self-leave" ON public.programme_members;

CREATE POLICY "Members read co-members"
  ON public.programme_members FOR SELECT
  USING (
    public.fn_user_is_programme_member(auth.uid(), programme_id)
  );

CREATE POLICY "Owner adds members"
  ON public.programme_members FOR INSERT
  WITH CHECK (
    public.fn_user_is_programme_owner(auth.uid(), programme_id)
  );

CREATE POLICY "Owner updates members"
  ON public.programme_members FOR UPDATE
  USING (
    public.fn_user_is_programme_owner(auth.uid(), programme_id)
  );

CREATE POLICY "Owner removes members or self-leave"
  ON public.programme_members FOR DELETE
  USING (
    public.fn_user_is_programme_owner(auth.uid(), programme_id)
    OR (programme_members.user_id = auth.uid() AND programme_members.role <> 'owner')
  );