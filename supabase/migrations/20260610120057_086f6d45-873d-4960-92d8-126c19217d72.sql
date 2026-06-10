
-- 1. Tighten satellite table read policies to require verified actor (or admin / full visibility)
DROP POLICY IF EXISTS "Read actor_contacts" ON public.actor_contacts;
CREATE POLICY "Read actor_contacts" ON public.actor_contacts FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_contacts.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Authenticated read actor_aliases" ON public.actor_aliases;
CREATE POLICY "Authenticated read actor_aliases" ON public.actor_aliases FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_aliases.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Read actor_certifications" ON public.actor_certifications;
CREATE POLICY "Read actor_certifications" ON public.actor_certifications FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_certifications.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Read actor_customer_history" ON public.actor_customer_history;
CREATE POLICY "Read actor_customer_history" ON public.actor_customer_history FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_customer_history.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Read actor_descriptions" ON public.actor_descriptions;
CREATE POLICY "Read actor_descriptions" ON public.actor_descriptions FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_descriptions.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Read actor_media" ON public.actor_media;
CREATE POLICY "Read actor_media" ON public.actor_media FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_media.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Read actor_ontology_tags" ON public.actor_ontology_tags;
CREATE POLICY "Read actor_ontology_tags" ON public.actor_ontology_tags FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_ontology_tags.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Read actor_standards" ON public.actor_standards;
CREATE POLICY "Read actor_standards" ON public.actor_standards FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_standards.actor_id AND a.verification_status = 'verified')
);

DROP POLICY IF EXISTS "Authenticated read actor_relationships" ON public.actor_relationships;
CREATE POLICY "Authenticated read actor_relationships" ON public.actor_relationships FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR fn_user_has_attr(auth.uid(), 'actors:visibility', 'all')
  OR (
    EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_relationships.source_actor_id AND a.verification_status = 'verified')
    AND EXISTS (SELECT 1 FROM public.actors a WHERE a.id = actor_relationships.target_actor_id AND a.verification_status = 'verified')
  )
);

-- 2. Restrict search_analytics: members only see their own rows
DROP POLICY IF EXISTS "Programme members read scoped analytics" ON public.search_analytics;
CREATE POLICY "Users read own analytics" ON public.search_analytics FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3. Fix functions missing search_path
ALTER FUNCTION public.fn_check_strong_product_association(text, text, text) SET search_path = public;
ALTER FUNCTION public.fn_url_host(text) SET search_path = public;

-- 4. Revoke anonymous EXECUTE on all our SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname LIKE 'fn\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
  END LOOP;
END $$;

-- 5. Restrict storage.objects listing on actor-media to authenticated only
DROP POLICY IF EXISTS "Authenticated read actor-media" ON storage.objects;
CREATE POLICY "Authenticated read actor-media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'actor-media');
