-- ==============================================================================
-- SentinelFL Migration 04: public.model_runs Row Level Security and Policies
--
-- Fixes:
-- 1. Replaces deprecated policy referencing dropped get_user_workspace_ids() function.
-- 2. Uses non-recursive SECURITY DEFINER helpers:
--      public.is_workspace_owner(workspace_id)
--      public.is_workspace_member(workspace_id)
-- 3. Grants SELECT, INSERT, UPDATE, and DELETE policies to authenticated users.
-- 4. Never broadens access to public or anonymous users.
-- ==============================================================================

BEGIN;

-- Enable RLS on model_runs
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;

-- Clean existing policies on model_runs
DROP POLICY IF EXISTS "model_runs_select_policy" ON public.model_runs;
DROP POLICY IF EXISTS "model_runs_insert_policy" ON public.model_runs;
DROP POLICY IF EXISTS "model_runs_update_policy" ON public.model_runs;
DROP POLICY IF EXISTS "model_runs_delete_policy" ON public.model_runs;

-- 1. SELECT Policy:
-- Authorized if:
--   a) Caller created the model run (created_by = auth.uid())
--   b) Associated dataset belongs to a workspace caller owns or is a member of
CREATE POLICY "model_runs_select_policy"
ON public.model_runs
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR
  dataset_id IN (
    SELECT id FROM public.datasets
    WHERE (
      uploaded_by = auth.uid()
      OR public.is_workspace_owner(workspace_id)
      OR public.is_workspace_member(workspace_id)
    )
  )
);

-- 2. INSERT Policy:
-- Authorized if:
--   a) created_by is either null or matches auth.uid()
--   b) If dataset_id is provided, caller has ownership/membership in dataset workspace
CREATE POLICY "model_runs_insert_policy"
ON public.model_runs
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by IS NULL OR created_by = auth.uid())
  AND
  (
    dataset_id IS NULL
    OR
    dataset_id IN (
      SELECT id FROM public.datasets
      WHERE (
        uploaded_by = auth.uid()
        OR public.is_workspace_owner(workspace_id)
        OR public.is_workspace_member(workspace_id)
      )
    )
  )
);

-- 3. UPDATE Policy:
-- Only creator or workspace owner can update run status or metrics
CREATE POLICY "model_runs_update_policy"
ON public.model_runs
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR
  dataset_id IN (
    SELECT id FROM public.datasets
    WHERE (
      uploaded_by = auth.uid()
      OR public.is_workspace_owner(workspace_id)
    )
  )
)
WITH CHECK (
  created_by = auth.uid()
  OR
  dataset_id IN (
    SELECT id FROM public.datasets
    WHERE (
      uploaded_by = auth.uid()
      OR public.is_workspace_owner(workspace_id)
    )
  )
);

-- 4. DELETE Policy:
-- Only creator or workspace owner can delete model runs
CREATE POLICY "model_runs_delete_policy"
ON public.model_runs
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR
  dataset_id IN (
    SELECT id FROM public.datasets
    WHERE (
      uploaded_by = auth.uid()
      OR public.is_workspace_owner(workspace_id)
    )
  )
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_model_runs_dataset_id ON public.model_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_model_runs_created_by ON public.model_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_model_runs_status ON public.model_runs(status);

COMMIT;
