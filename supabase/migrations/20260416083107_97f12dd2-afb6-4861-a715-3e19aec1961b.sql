
-- Create the need-attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'need-attachments',
  'need-attachments',
  false,
  10485760,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
);

-- Authenticated users can upload files to their own session paths
CREATE POLICY "Users can upload need attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'need-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.search_sessions s WHERE s.user_id = auth.uid()
  )
);

-- Users can read their own attachments
CREATE POLICY "Users can read own need attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'need-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.search_sessions s WHERE s.user_id = auth.uid()
  )
);

-- Users can delete their own attachments
CREATE POLICY "Users can delete own need attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'need-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.search_sessions s WHERE s.user_id = auth.uid()
  )
);

-- Admins have full access
CREATE POLICY "Admins full access need attachments"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'need-attachments'
  AND public.is_admin(auth.uid())
);
