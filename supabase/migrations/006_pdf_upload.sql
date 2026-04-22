-- 006_pdf_upload.sql — PDF upload support for physical resources
--
-- Adds source.pdf_storage_path so we can point to a PDF blob in Supabase
-- Storage (bucket `pdfs`). The raw text extracted from the PDF still lives
-- in source.raw_content like any other source, so highlights / journal /
-- distill all work unchanged.

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT;

CREATE INDEX IF NOT EXISTS sources_pdf_path_idx ON sources (pdf_storage_path)
  WHERE pdf_storage_path IS NOT NULL;

-- ---------------------------------------------------------------
-- Storage bucket + RLS policies for uploaded PDFs.
--
-- Private bucket — files are keyed by `<user_id>/<source_id>.pdf`. Row-level
-- security matches the user_id prefix so each user can only touch their own
-- files. service_role bypasses RLS and handles server-side extraction.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'pdfs', 'pdfs', false,
    20971520,           -- 20 MiB
    ARRAY['application/pdf']::text[]
  )
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- Owner can read / write / delete their own PDFs.
DROP POLICY IF EXISTS pdfs_owner_read ON storage.objects;
CREATE POLICY pdfs_owner_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS pdfs_owner_insert ON storage.objects;
CREATE POLICY pdfs_owner_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS pdfs_owner_delete ON storage.objects;
CREATE POLICY pdfs_owner_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
