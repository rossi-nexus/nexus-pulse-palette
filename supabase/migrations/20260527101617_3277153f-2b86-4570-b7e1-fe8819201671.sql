
INSERT INTO storage.buckets (id, name, public)
VALUES ('actor-media', 'actor-media', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.actor_media
  ADD COLUMN IF NOT EXISTS original_url text,
  ADD COLUMN IF NOT EXISTS crop_data jsonb,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.fn_can_write_actor_media(_actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.actors a
      WHERE a.id = _actor_id AND a.verifier_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "Admin manage actor_media" ON public.actor_media;
DROP POLICY IF EXISTS "Authorised insert actor_media" ON public.actor_media;
DROP POLICY IF EXISTS "Authorised update actor_media" ON public.actor_media;
DROP POLICY IF EXISTS "Authorised delete actor_media" ON public.actor_media;

CREATE POLICY "Authorised insert actor_media"
  ON public.actor_media FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_write_actor_media(actor_id));

CREATE POLICY "Authorised update actor_media"
  ON public.actor_media FOR UPDATE TO authenticated
  USING (public.fn_can_write_actor_media(actor_id))
  WITH CHECK (public.fn_can_write_actor_media(actor_id));

CREATE POLICY "Authorised delete actor_media"
  ON public.actor_media FOR DELETE TO authenticated
  USING (public.fn_can_write_actor_media(actor_id));

DROP POLICY IF EXISTS "Authenticated read actor-media" ON storage.objects;
DROP POLICY IF EXISTS "Authorised write actor-media" ON storage.objects;
DROP POLICY IF EXISTS "Authorised update actor-media" ON storage.objects;
DROP POLICY IF EXISTS "Authorised delete actor-media" ON storage.objects;

CREATE POLICY "Authenticated read actor-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'actor-media');

CREATE POLICY "Authorised write actor-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'actor-media'
    AND public.fn_can_write_actor_media( ((storage.foldername(name))[1])::uuid )
  );

CREATE POLICY "Authorised update actor-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'actor-media'
    AND public.fn_can_write_actor_media( ((storage.foldername(name))[1])::uuid )
  );

CREATE POLICY "Authorised delete actor-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'actor-media'
    AND public.fn_can_write_actor_media( ((storage.foldername(name))[1])::uuid )
  );
