-- Batch B schema additions: section skips + contact curation columns

-- 1) Section skips table
CREATE TABLE public.actor_section_skips (
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  reason text,
  skipped_by uuid,
  skipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, section_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actor_section_skips TO authenticated;
GRANT ALL ON public.actor_section_skips TO service_role;

ALTER TABLE public.actor_section_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read actor_section_skips"
  ON public.actor_section_skips FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_section_skips.actor_id));

CREATE POLICY "Admins manage actor_section_skips"
  ON public.actor_section_skips FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Owners can write actor_section_skips"
  ON public.actor_section_skips FOR INSERT TO authenticated
  WITH CHECK (
    skipped_by = auth.uid() AND
    EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_section_skips.actor_id AND a.verifier_id = auth.uid())
  );

CREATE POLICY "Owners can delete actor_section_skips"
  ON public.actor_section_skips FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_section_skips.actor_id AND a.verifier_id = auth.uid())
  );

-- 2) Contact curation columns
ALTER TABLE public.actor_contacts
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Note: actor_contacts already has email, phone, linkedin columns.
-- We add linkedin_url as the canonical full-URL field. Migrate any existing 'linkedin' values that look like URLs.
UPDATE public.actor_contacts
SET linkedin_url = linkedin
WHERE linkedin_url IS NULL AND linkedin IS NOT NULL AND linkedin ~* '^https?://';