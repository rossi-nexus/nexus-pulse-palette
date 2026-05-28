ALTER TABLE public.actor_contacts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';