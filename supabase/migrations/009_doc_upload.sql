-- 009_doc_upload.sql
--
-- Grow the `pdfs` bucket into a general document bucket:
--   - allow EPUB files too
--   - raise the per-file size limit from 20 MiB to 200 MiB so long-form
--     books and scanned PDFs don't get rejected at upload time
--
-- Keeping the bucket id `pdfs` avoids breaking historical storage paths
-- that are already persisted on sources.pdf_storage_path.

UPDATE storage.buckets
   SET file_size_limit = 209715200,           -- 200 MiB
       allowed_mime_types = ARRAY[
         'application/pdf',
         'application/epub+zip'
       ]::text[]
 WHERE id = 'pdfs';
