-- ==============================================================================
-- SentinelFL — Federated IoT Threat Intelligence
-- Migration: 02_dataset_management_and_storage.sql
-- Description:
--   1. Creates the private Supabase Storage bucket 'sentinelfl-datasets' (100MB limit).
--   2. Enforces strict Storage RLS policies on storage.objects scoped to authenticated
--      researchers and workspace boundaries.
--   3. Safely enhances public.datasets with optional metadata columns (file_size,
--      file_format, row_count, column_count, label_column, iot_status).
--   4. Creates granular SELECT, INSERT, UPDATE, and DELETE RLS policies on public.datasets.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Private Storage Bucket: sentinelfl-datasets
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sentinelfl-datasets',
  'sentinelfl-datasets',
  false,                             -- Strictly private (no public read)
  104857600,                         -- 100 MB max file size
  ARRAY['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv'];


-- ------------------------------------------------------------------------------
-- 2. Storage RLS Policies (storage.objects)
-- File objects are structured as: {user_id}/{dataset_id}/{clean_filename}
-- ------------------------------------------------------------------------------

-- Ensure RLS is active on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any previous or duplicate policies
DROP POLICY IF EXISTS "sentinelfl_storage_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "sentinelfl_storage_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "sentinelfl_storage_delete_policy" ON storage.objects;

-- Storage INSERT: Authenticated users can only upload into their own user folder prefix
CREATE POLICY "sentinelfl_storage_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sentinelfl-datasets'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    split_part(name, '/', 1) = auth.uid()::text
  )
);

-- Storage SELECT: Owners or authorized workspace members can download/inspect the object
CREATE POLICY "sentinelfl_storage_select_policy"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sentinelfl-datasets'
  AND (
    -- Direct uploader access
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    split_part(name, '/', 1) = auth.uid()::text
    OR
    -- Workspace membership access through verified metadata record
    EXISTS (
      SELECT 1 FROM public.datasets d
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE d.storage_path = name
        AND (
          w.owner_id = auth.uid()
          OR
          w.id IN (SELECT public.get_user_workspace_ids(auth.uid()))
        )
    )
  )
);

-- Storage DELETE: Direct uploader or workspace owner can delete the storage object
CREATE POLICY "sentinelfl_storage_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'sentinelfl-datasets'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    split_part(name, '/', 1) = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.datasets d
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE d.storage_path = name
        AND (
          w.owner_id = auth.uid()
          OR
          d.uploaded_by = auth.uid()
        )
    )
  )
);


-- ------------------------------------------------------------------------------
-- 3. Schema Enhancements on public.datasets
-- Adds optional columns if not present; maintains full backward compatibility.
-- ------------------------------------------------------------------------------
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS file_format text DEFAULT 'csv';
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS row_count integer DEFAULT 0;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS column_count integer DEFAULT 0;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS label_column text;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS iot_status text DEFAULT 'not_inspected';


-- ------------------------------------------------------------------------------
-- 4. Granular Row Level Security on public.datasets
-- ------------------------------------------------------------------------------
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "datasets_select_policy" ON public.datasets;
DROP POLICY IF EXISTS "datasets_insert_policy" ON public.datasets;
DROP POLICY IF EXISTS "datasets_update_policy" ON public.datasets;
DROP POLICY IF EXISTS "datasets_delete_policy" ON public.datasets;

-- SELECT: Researchers can only view datasets belonging to workspaces they own or belong to
CREATE POLICY "datasets_select_policy"
ON public.datasets
FOR SELECT
TO authenticated
USING (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT public.get_user_workspace_ids(auth.uid())
  )
);

-- INSERT: Researchers can only insert datasets into their own authorized workspace
CREATE POLICY "datasets_insert_policy"
ON public.datasets
FOR INSERT
TO authenticated
WITH CHECK (
  (uploaded_by IS NULL OR uploaded_by = auth.uid())
  AND
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT public.get_user_workspace_ids(auth.uid())
  )
);

-- UPDATE: Only the uploader or workspace owner can update metadata
CREATE POLICY "datasets_update_policy"
ON public.datasets
FOR UPDATE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
)
WITH CHECK (
  uploaded_by = auth.uid()
  OR
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
);

-- DELETE: Only the uploader or workspace owner can delete datasets
CREATE POLICY "datasets_delete_policy"
ON public.datasets
FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
);

COMMIT;
