-- ==============================================================================
-- SentinelFL — Federated IoT Threat Intelligence
-- Migration: 01_workspace_management_and_rls.sql
-- Description:
--   1. Fixes infinite recursion in public.workspace_members RLS policies using
--      a SECURITY DEFINER helper function (public.get_user_workspace_ids) with
--      restricted search_path.
--   2. Provides the idempotent, concurrency-safe public.create_workspace RPC
--      with SECURITY DEFINER and grants EXECUTE to authenticated users.
--   3. Enforces strict Row Level Security (RLS) on workspaces, workspace_members,
--      datasets, preprocessing_jobs, model_runs, and federated_rounds without
--      trusting browser-supplied user IDs or role values.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Helper Function: get_user_workspace_ids
-- Resolves user workspace membership without triggering recursive RLS evaluation.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = p_user_id;
$$;

-- Restrict execution permissions
REVOKE ALL ON FUNCTION public.get_user_workspace_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) TO service_role;

COMMENT ON FUNCTION public.get_user_workspace_ids(uuid) IS
  'Returns the set of workspace IDs that the specified user belongs to. Runs as SECURITY DEFINER to eliminate RLS recursion on workspace_members.';


-- ------------------------------------------------------------------------------
-- 2. Non-Recursive RLS Policies on public.workspace_members
-- ------------------------------------------------------------------------------
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Drop any legacy or recursive policies
DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_select_policy" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_insert_policy" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete_policy" ON public.workspace_members;

-- Non-recursive SELECT policy:
-- A user can view workspace member records if:
--   (a) the record belongs to themselves (user_id = auth.uid()), OR
--   (b) they belong to the same workspace (resolved via SECURITY DEFINER helper).
CREATE POLICY "workspace_members_select_policy"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
);


-- ------------------------------------------------------------------------------
-- 3. Row Level Security Policies on public.workspaces
-- ------------------------------------------------------------------------------
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_select_policy" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_insert_policy" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update_policy" ON public.workspaces;

-- Users can only view workspaces they own or are members of
CREATE POLICY "workspaces_select_policy"
ON public.workspaces
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR
  id IN (SELECT public.get_user_workspace_ids(auth.uid()))
);

-- Workspace updates restricted to owner
CREATE POLICY "workspaces_update_policy"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());


-- ------------------------------------------------------------------------------
-- 4. RPC: public.create_workspace
-- Creates or retrieves a personal workspace idempotently and securely.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace(
  workspace_name text,
  personal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_workspace record;
  v_clean_name text;
BEGIN
  -- Strict authentication check: identity derived strictly from session, never client params
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: must have valid session to create workspace'
      USING ERRCODE = '28000';
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(workspace_name), ''), 'Personal Research Workspace');

  -- Concurrency check & deduplication:
  -- If requesting a personal workspace, check whether the user already owns one.
  IF personal THEN
    SELECT id, name, is_personal, owner_id, created_at
    INTO v_workspace
    FROM public.workspaces
    WHERE owner_id = v_user_id AND is_personal = true
    LIMIT 1;

    IF FOUND THEN
      -- Return existing personal workspace without creating duplicates
      RETURN jsonb_build_object(
        'id', v_workspace.id,
        'name', v_workspace.name,
        'is_personal', v_workspace.is_personal,
        'owner_id', v_workspace.owner_id,
        'created_at', v_workspace.created_at
      );
    END IF;
  END IF;

  -- Create new workspace row
  INSERT INTO public.workspaces (name, is_personal, owner_id)
  VALUES (v_clean_name, personal, v_user_id)
  RETURNING id, name, is_personal, owner_id, created_at INTO v_workspace;

  -- Automatically grant creator owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace.id, v_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_workspace.id,
    'name', v_workspace.name,
    'is_personal', v_workspace.is_personal,
    'owner_id', v_workspace.owner_id,
    'created_at', v_workspace.created_at
  );
END;
$$;

-- Grant EXECUTE permission to authenticated researchers
REVOKE ALL ON FUNCTION public.create_workspace(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, boolean) TO service_role;

COMMENT ON FUNCTION public.create_workspace(text, boolean) IS
  'Securely creates or retrieves a workspace for the authenticated session user with deduplication for personal workspaces.';


-- ------------------------------------------------------------------------------
-- 5. Resource Table RLS Policies (Datasets, Preprocessing, Model Runs, FL Rounds)
-- Enforces that private workspace data is only accessible to authorized members.
-- ------------------------------------------------------------------------------

-- Datasets
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "datasets_select_policy" ON public.datasets;
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

-- Preprocessing Jobs (linked via dataset_id -> datasets.workspace_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'preprocessing_jobs') THEN
    ALTER TABLE public.preprocessing_jobs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "preprocessing_jobs_select_policy" ON public.preprocessing_jobs;
    CREATE POLICY "preprocessing_jobs_select_policy"
    ON public.preprocessing_jobs
    FOR SELECT
    TO authenticated
    USING (
      dataset_id IN (
        SELECT id FROM public.datasets
        WHERE workspace_id IN (
          SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
          UNION
          SELECT public.get_user_workspace_ids(auth.uid())
        )
      )
    );
  END IF;
END $$;

-- Model Runs (linked via dataset_id -> datasets.workspace_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'model_runs') THEN
    ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "model_runs_select_policy" ON public.model_runs;
    CREATE POLICY "model_runs_select_policy"
    ON public.model_runs
    FOR SELECT
    TO authenticated
    USING (
      dataset_id IN (
        SELECT id FROM public.datasets
        WHERE workspace_id IN (
          SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
          UNION
          SELECT public.get_user_workspace_ids(auth.uid())
        )
      )
    );
  END IF;
END $$;

-- Federated Rounds (linked via dataset_id -> datasets.workspace_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'federated_rounds') THEN
    ALTER TABLE public.federated_rounds ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "federated_rounds_select_policy" ON public.federated_rounds;
    CREATE POLICY "federated_rounds_select_policy"
    ON public.federated_rounds
    FOR SELECT
    TO authenticated
    USING (
      dataset_id IN (
        SELECT id FROM public.datasets
        WHERE workspace_id IN (
          SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
          UNION
          SELECT public.get_user_workspace_ids(auth.uid())
        )
      )
    );
  END IF;
END $$;

COMMIT;
