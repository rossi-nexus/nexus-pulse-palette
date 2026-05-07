
-- Idempotent test-user seeding for Phase 6.5.5c-b smoke matrix.

-- 1. user.t1 gets role:consultant
INSERT INTO public.user_attributes (user_id, key, value, granted_by)
SELECT 'c1ab2290-d262-4316-99e6-9d6644e145e7'::uuid, 'role', 'consultant',
       '9a0b74fa-4b8c-4ebd-82c2-0e899af46a39'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_attributes
  WHERE user_id = 'c1ab2290-d262-4316-99e6-9d6644e145e7'::uuid
    AND key = 'role' AND value = 'consultant'
);

-- 2. Ensure user.t2 owns at least one programme.
INSERT INTO public.programmes (name, description, client_org, owner_user_id)
SELECT 'ABAC test — t2 programme', NULL, NULL,
       '41a86d77-f9e1-4592-8705-2183b9b2bd13'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.programmes
  WHERE owner_user_id = '41a86d77-f9e1-4592-8705-2183b9b2bd13'::uuid
);

-- 3. Add user.t3 as viewer to admin's earliest programme.
INSERT INTO public.programme_members (programme_id, user_id, role, invited_by)
SELECT p.id, '4de895f0-03c8-4cfc-8732-d6c1e8b6983a'::uuid, 'viewer',
       '9a0b74fa-4b8c-4ebd-82c2-0e899af46a39'::uuid
FROM public.programmes p
WHERE p.owner_user_id = '9a0b74fa-4b8c-4ebd-82c2-0e899af46a39'::uuid
ORDER BY p.created_at ASC
LIMIT 1
ON CONFLICT (programme_id, user_id) DO NOTHING;
