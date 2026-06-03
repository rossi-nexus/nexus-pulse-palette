-- V3 batch #4 part 2 — Per-product enrichment storage.
-- Add product-name + source URL + structured metadata to actor_descriptions so
-- the per-product enrichment edge function can upsert rich content keyed on
-- (actor_id, type='product', name).

ALTER TABLE public.actor_descriptions
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;

-- Unique key per actor + type + name for product/service rows. Allow legacy rows
-- (name IS NULL) to coexist by scoping the unique index to non-null names.
CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_descriptions_actor_type_name
  ON public.actor_descriptions (actor_id, type, lower(name))
  WHERE name IS NOT NULL;