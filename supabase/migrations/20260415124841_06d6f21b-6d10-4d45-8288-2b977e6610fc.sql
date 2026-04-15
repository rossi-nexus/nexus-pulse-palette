
-- ============================================================
-- NEXUS COMPLETE SCHEMA — PART 1: CORE TABLES + FUNCTIONS
-- ============================================================

-- Helper: updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. USERS (must come before helper functions that reference it)
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  access_tier text NOT NULL DEFAULT 'tier_3' CHECK (access_tier IN ('tier_1', 'tier_2', 'tier_3')),
  organization_name text,
  is_anonymous boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Now create helper functions that reference users table
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.get_user_tier(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT access_tier FROM public.users WHERE id = _user_id;
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ONTOLOGY
CREATE TABLE public.ontology_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('capability', 'competence', 'domain', 'product_type', 'service_type')),
  normalized_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ontology_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.ontology_categories(id),
  raw_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ontology_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ontology_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read active ontology categories" ON public.ontology_categories
  FOR SELECT TO authenticated USING (status = 'active' OR public.is_admin(auth.uid()));
CREATE POLICY "Admins insert ontology categories" ON public.ontology_categories
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins update ontology categories" ON public.ontology_categories
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete ontology categories" ON public.ontology_categories
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Auth users read active ontology entries" ON public.ontology_entries
  FOR SELECT TO authenticated USING (status = 'active' OR public.is_admin(auth.uid()));
CREATE POLICY "Admins insert ontology entries" ON public.ontology_entries
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins update ontology entries" ON public.ontology_entries
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete ontology entries" ON public.ontology_entries
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_ontology_categories_updated_at
  BEFORE UPDATE ON public.ontology_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ontology_entries_updated_at
  BEFORE UPDATE ON public.ontology_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ACTORS
CREATE TABLE public.actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_names text[] DEFAULT '{}',
  org_number text,
  street_address text, city text, region text, country text,
  coordinates point,
  websites text[] DEFAULT '{}',
  source text NOT NULL CHECK (source IN ('search', 'manual', 'url_import', 'file_import', 'batch_import', 'api_connector')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'admin_verified')),
  data_completeness text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.actors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access actors" ON public.actors FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "T1 read all actors" ON public.actors FOR SELECT TO authenticated USING (public.get_user_tier(auth.uid()) = 'tier_1');
CREATE POLICY "T2 read all actors" ON public.actors FOR SELECT TO authenticated USING (public.get_user_tier(auth.uid()) = 'tier_2');
CREATE POLICY "T3 read verified actors" ON public.actors FOR SELECT TO authenticated USING (public.get_user_tier(auth.uid()) = 'tier_3' AND verification_status = 'admin_verified');

CREATE TRIGGER update_actors_updated_at
  BEFORE UPDATE ON public.actors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. ACTOR CHILD TABLES
CREATE TABLE public.actor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  name text NOT NULL, title text, email text, phone text, linkedin text
);

CREATE TABLE public.actor_ontology_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  ontology_entry_id uuid NOT NULL REFERENCES public.ontology_entries(id),
  source text NOT NULL CHECK (source IN ('search', 'manual', 'api_connector')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_capacity_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  actor_ontology_tag_id uuid NOT NULL REFERENCES public.actor_ontology_tags(id) ON DELETE CASCADE,
  attribute_type text NOT NULL CHECK (attribute_type IN ('volume', 'fleet_size', 'team_size', 'mobilization_time', 'coverage', 'specification')),
  value_text text NOT NULL, value_min numeric, value_max numeric, unit text, evidence text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  classification_system text NOT NULL CHECK (classification_system IN ('NO', 'SE', 'FI', 'DK', 'DE', 'FR', 'GB', 'IT', 'NATO', 'EU')),
  level_normalized text NOT NULL CHECK (level_normalized IN ('top_secret', 'secret', 'confidential', 'restricted', 'industrial_security', 'unclassified', 'unknown')),
  level_national_term text, issuing_authority text,
  confidence text CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  evidence text, valid_from date, valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  standard_name text NOT NULL, standard_number text, scope text, certifying_body text,
  valid_from date, valid_to date, evidence text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_customer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  customer_name text NOT NULL, description text, year integer, domain text,
  customer_segment text CHECK (customer_segment IN ('defense', 'civil_government', 'commercial', 'export')),
  branch_detail text, is_reference boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('summary', 'capability', 'product', 'service')),
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('ai', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('logo', 'hero', 'product')),
  url text NOT NULL,
  linked_ontology_entry_id uuid REFERENCES public.ontology_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on all actor child tables
ALTER TABLE public.actor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_ontology_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_capacity_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_customer_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_media ENABLE ROW LEVEL SECURITY;

-- Child table policies: read if you can see the parent actor (RLS cascades through EXISTS)
CREATE POLICY "Read actor_contacts" ON public.actor_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_contacts.actor_id));
CREATE POLICY "Admin manage actor_contacts" ON public.actor_contacts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_ontology_tags" ON public.actor_ontology_tags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_ontology_tags.actor_id));
CREATE POLICY "Admin manage actor_ontology_tags" ON public.actor_ontology_tags FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_capacity_attributes" ON public.actor_capacity_attributes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors a JOIN public.actor_ontology_tags t ON t.actor_id = a.id WHERE t.id = actor_capacity_attributes.actor_ontology_tag_id));
CREATE POLICY "Admin manage actor_capacity_attributes" ON public.actor_capacity_attributes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_classifications" ON public.actor_classifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_classifications.actor_id));
CREATE POLICY "Admin manage actor_classifications" ON public.actor_classifications FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_standards" ON public.actor_standards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_standards.actor_id));
CREATE POLICY "Admin manage actor_standards" ON public.actor_standards FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_customer_history" ON public.actor_customer_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_customer_history.actor_id));
CREATE POLICY "Admin manage actor_customer_history" ON public.actor_customer_history FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_descriptions" ON public.actor_descriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_descriptions.actor_id));
CREATE POLICY "Admin manage actor_descriptions" ON public.actor_descriptions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Read actor_media" ON public.actor_media FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actors WHERE id = actor_media.actor_id));
CREATE POLICY "Admin manage actor_media" ON public.actor_media FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- 5. SESSIONS & PIPELINE STATE
CREATE TABLE public.search_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  name text, project_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_saved_at timestamptz
);

CREATE TABLE public.session_step_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('A1', 'A2', 'A3', 'A4', 'A5')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'editing', 'locked')),
  locked_output jsonb, locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, step)
);

CREATE TABLE public.session_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.actors(id),
  role_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('included', 'saved_for_later')),
  search_data jsonb, analysis_data jsonb, db_check_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_step_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_actors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own sessions access" ON public.search_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Own step states access" ON public.session_step_states FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.search_sessions s WHERE s.id = session_step_states.session_id AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "Own session actors access" ON public.session_actors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.search_sessions s WHERE s.id = session_actors.session_id AND (s.user_id = auth.uid() OR public.is_admin(auth.uid()))));

CREATE TRIGGER update_search_sessions_updated_at
  BEFORE UPDATE ON public.search_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_session_step_states_updated_at
  BEFORE UPDATE ON public.session_step_states FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. USER PERSONAL ACTORS & VALIDATION
CREATE TABLE public.user_personal_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  actor_id uuid NOT NULL REFERENCES public.actors(id),
  notes text, tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'personal' CHECK (status IN ('personal', 'suggested', 'merged')),
  suggested_at timestamptz, merged_actor_id uuid REFERENCES public.actors(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.actor_validation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_personal_actor_id uuid NOT NULL REFERENCES public.user_personal_actors(id),
  suggested_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  duplicate_check_result jsonb, admin_notes text,
  reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_personal_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_validation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own personal actors" ON public.user_personal_actors FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Admin validation queue" ON public.actor_validation_queue FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- 7. SEARCH ANALYTICS
CREATE TABLE public.search_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.search_sessions(id),
  user_id uuid REFERENCES public.users(id),
  user_tier text NOT NULL, is_anonymous boolean NOT NULL DEFAULT false,
  searched_capabilities text[] DEFAULT '{}', searched_competences text[] DEFAULT '{}',
  searched_domains text[] DEFAULT '{}', searched_product_types text[] DEFAULT '{}',
  searched_service_types text[] DEFAULT '{}',
  constraints_used jsonb, roles_created integer DEFAULT 0,
  actors_found integer DEFAULT 0, actors_included integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin analytics" ON public.search_analytics FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- 8. FUTURE-READY TABLES
CREATE TABLE public.intelligence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, source_url text, source_name text, author text,
  publication_date date, ingestion_date timestamptz NOT NULL DEFAULT now(),
  full_text text, extracted_entities jsonb, ontology_tags jsonb, admin_notes text,
  status text NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'processed', 'reviewed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.api_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, provider text, data_type text,
  sector_coverage text[] DEFAULT '{}', auth_method text, rate_limit integer,
  refresh_schedule text,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'pending', 'error')),
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intelligence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin intelligence" ON public.intelligence_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin connectors" ON public.api_connectors FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_api_connectors_updated_at
  BEFORE UPDATE ON public.api_connectors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
