
-- =============== actor_relationships ===============
CREATE TABLE public.actor_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  target_actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'parent_of','subsidiary_of','acquired','acquired_by',
    'former_name_of','renamed_to','merged_with'
  )),
  evidence text,
  source_url text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actor_relationships_no_self CHECK (source_actor_id <> target_actor_id),
  CONSTRAINT actor_relationships_unique UNIQUE (source_actor_id, target_actor_id, relationship_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actor_relationships TO authenticated;
GRANT ALL ON public.actor_relationships TO service_role;

ALTER TABLE public.actor_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read actor_relationships"
  ON public.actor_relationships FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.actors a WHERE a.id = source_actor_id)
    AND EXISTS (SELECT 1 FROM public.actors a WHERE a.id = target_actor_id)
  );

CREATE POLICY "Admins write actor_relationships"
  ON public.actor_relationships FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update actor_relationships"
  ON public.actor_relationships FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete actor_relationships"
  ON public.actor_relationships FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_actor_rel_source ON public.actor_relationships(source_actor_id);
CREATE INDEX idx_actor_rel_target ON public.actor_relationships(target_actor_id);

-- =============== actor_classification ===============
ALTER TABLE public.actors
  ADD COLUMN actor_classification text NOT NULL DEFAULT 'commercial'
  CHECK (actor_classification IN ('commercial', 'reference'));

-- Backfill: actors with ontology tags whose entry name matches known reference-type keywords
UPDATE public.actors a
SET actor_classification = 'reference'
WHERE EXISTS (
  SELECT 1
  FROM public.actor_ontology_tags t
  JOIN public.ontology_entries e ON e.id = t.ontology_entry_id
  WHERE t.actor_id = a.id
    AND (
      lower(e.raw_name) LIKE '%government%' OR
      lower(e.raw_name) LIKE '%ministry%' OR
      lower(e.raw_name) LIKE '%agency%' OR
      lower(e.raw_name) LIKE '%research institute%' OR
      lower(e.raw_name) LIKE '%university%' OR
      lower(e.raw_name) LIKE '%standards body%' OR
      lower(e.raw_name) LIKE '%standards organisation%' OR
      lower(e.raw_name) LIKE '%standards organization%' OR
      lower(e.raw_name) LIKE '%ngo%'
    )
);

-- =============== actor_aliases ===============
CREATE TABLE public.actor_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  alias_type text CHECK (alias_type IN ('former_name','trade_name','brand','abbreviation')),
  valid_from timestamptz,
  valid_to timestamptz,
  evidence text,
  source_url text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actor_aliases_unique UNIQUE (actor_id, alias_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actor_aliases TO authenticated;
GRANT ALL ON public.actor_aliases TO service_role;

ALTER TABLE public.actor_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read actor_aliases"
  ON public.actor_aliases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_id));

CREATE POLICY "Admins insert actor_aliases"
  ON public.actor_aliases FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update actor_aliases"
  ON public.actor_aliases FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete actor_aliases"
  ON public.actor_aliases FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_actor_aliases_name_lower ON public.actor_aliases (lower(alias_name));
CREATE INDEX idx_actor_aliases_actor ON public.actor_aliases(actor_id);
