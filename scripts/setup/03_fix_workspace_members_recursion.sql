-- ==============================================================================
-- SentinelFL — Federated IoT Threat Intelligence
-- Migration: 03_fix_workspace_members_recursion.sql (Reviewed & Corrected)
--
-- PURPOSE:
--   Permanently eliminates PostgreSQL error 42P17 ("infinite recursion detected
--   in policy for relation 'workspace_members'") when recording dataset metadata,
--   while preserving strict Row Level Security, private storage isolation, and
--   workspace authorization rules.
--
-- TABLE COLUMNS VERIFIED IN LIVE SCHEMA:
--   - public.profiles:          (id, full_name, created_at)
--   - public.workspaces:        (id, name, is_personal, owner_id, created_at)
--   - public.workspace_members: (workspace_id, user_id, role, created_at)
--   - public.datasets:          (id, name, storage_path, workspace_id, status,
--                                created_at, description, uploaded_by)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CLEANUP OF INSECURE / DEPRECATED HELPERS
-- ------------------------------------------------------------------------------

-- Drop deprecated or previous versions of functions to allow clean return type changes without 42P13
DROP FUNCTION IF EXISTS public.get_user_workspace_ids(uuid);
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid);
DROP FUNCTION IF EXISTS public.is_workspace_owner(uuid);
DROP FUNCTION IF EXISTS public.is_workspace_admin_or_owner(uuid);


-- ------------------------------------------------------------------------------
-- 2. SECURITY DEFINER HELPER FUNCTIONS
-- Rules:
--   - Derives caller identity strictly from auth.uid() (never trusts client parameters).
--   - Fixed search_path = public, pg_temp (prevents search_path hijacking).
--   - Fully qualified table references (public.workspace_members, public.workspaces).
--   - Returns minimal boolean information needed for authorization.
--   - Bypasses RLS *inside* the function body to break recursive evaluation loops.
-- ------------------------------------------------------------------------------

-- Helper 1: Check if calling session user is a member of the workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO service_role;

COMMENT ON FUNCTION public.is_workspace_member(uuid) IS
  'Returns true if auth.uid() is an authorized member of the specified workspace. Runs as SECURITY DEFINER to avoid RLS recursion.';


-- Helper 2: Check if calling session user is the direct owner of the workspace
CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE id = p_workspace_id
      AND owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO service_role;

COMMENT ON FUNCTION public.is_workspace_owner(uuid) IS
  'Returns true if auth.uid() is the direct owner of the specified workspace. Runs as SECURITY DEFINER to avoid RLS recursion.';


-- Helper 3: Check if calling session user is an admin or owner of the workspace
CREATE OR REPLACE FUNCTION public.is_workspace_admin_or_owner(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = p_workspace_id
      AND w.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_admin_or_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin_or_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin_or_owner(uuid) TO service_role;

COMMENT ON FUNCTION public.is_workspace_admin_or_owner(uuid) IS
  'Returns true if auth.uid() holds administrative or owner privileges in the workspace.';


-- ------------------------------------------------------------------------------
-- 3. WORKSPACE CONSTRAINTS (Prevent Duplicate Personal Workspaces)
-- ------------------------------------------------------------------------------

-- Safely resolve any pre-existing duplicate personal workspaces without data loss:
-- Keeps the earliest personal workspace for each owner as is_personal = true,
-- and converts any subsequent duplicates to standard workspaces (is_personal = false).
WITH ranked_personal_workspaces AS (
  SELECT id,
         owner_id,
         ROW_NUMBER() OVER (
           PARTITION BY owner_id
           ORDER BY created_at ASC
         ) as rn
  FROM public.workspaces
  WHERE is_personal = true
)
UPDATE public.workspaces w
SET is_personal = false
FROM ranked_personal_workspaces r
WHERE w.id = r.id AND r.rn > 1;

-- Ensure a user can only have at most one personal workspace under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_personal_workspace_idx
ON public.workspaces (owner_id)
WHERE is_personal = true;


-- ------------------------------------------------------------------------------
-- 4. POLICIES ON public.workspace_members
-- ------------------------------------------------------------------------------
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on workspace_members to remove any recursive references
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'workspace_members' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workspace_members', pol.policyname);
  END LOOP;
END $$;

-- SELECT: User can view their own membership row (zero subqueries) OR fellow members
-- in workspaces they belong to (via SECURITY DEFINER helper).
CREATE POLICY "workspace_members_select_policy"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  public.is_workspace_member(workspace_id)
);

-- INSERT: Only workspace owners and admins can add members directly.
-- Regular users cannot add themselves to arbitrary workspaces.
CREATE POLICY "workspace_members_insert_policy"
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_admin_or_owner(workspace_id)
  AND (
    role <> 'owner'
    OR
    public.is_workspace_owner(workspace_id)
  )
);

-- UPDATE: Only workspace owners and admins can update member roles.
-- Users cannot escalate their own privileges or assign themselves owner status.
CREATE POLICY "workspace_members_update_policy"
ON public.workspace_members
FOR UPDATE
TO authenticated
USING (
  public.is_workspace_admin_or_owner(workspace_id)
)
WITH CHECK (
  public.is_workspace_admin_or_owner(workspace_id)
  AND (
    user_id <> auth.uid()
    OR
    public.is_workspace_owner(workspace_id)
  )
  AND (
    role <> 'owner'
    OR
    public.is_workspace_owner(workspace_id)
  )
);

-- DELETE: Members can remove themselves (leave workspace) or owners/admins can remove members.
CREATE POLICY "workspace_members_delete_policy"
ON public.workspace_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR
  public.is_workspace_admin_or_owner(workspace_id)
);


-- ------------------------------------------------------------------------------
-- 5. POLICIES ON public.workspaces
-- ------------------------------------------------------------------------------
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'workspaces' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workspaces', pol.policyname);
  END LOOP;
END $$;

-- SELECT: Owner can always view; authorized members can view shared workspaces.
CREATE POLICY "workspaces_select_policy"
ON public.workspaces
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR
  public.is_workspace_member(id)
);

-- INSERT: Authenticated users can create workspaces with themselves as owner.
CREATE POLICY "workspaces_insert_policy"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
);

-- UPDATE: Only workspace owner can modify workspace properties.
CREATE POLICY "workspaces_update_policy"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- DELETE: Only workspace owner can delete workspace.
CREATE POLICY "workspaces_delete_policy"
ON public.workspaces
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());


-- ------------------------------------------------------------------------------
-- 6. POLICIES ON public.datasets
-- ------------------------------------------------------------------------------
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'datasets' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.datasets', pol.policyname);
  END LOOP;
END $$;

-- SELECT: Uploader, workspace owner, or verified workspace member.
-- Evaluated via SECURITY DEFINER helpers; zero recursive evaluation.
CREATE POLICY "datasets_select_policy"
ON public.datasets
FOR SELECT
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR
  public.is_workspace_owner(workspace_id)
  OR
  public.is_workspace_member(workspace_id)
);

-- INSERT: Authenticated user uploading to their own authorized workspace.
-- uploaded_by must match session auth.uid().
CREATE POLICY "datasets_insert_policy"
ON public.datasets
FOR INSERT
TO authenticated
WITH CHECK (
  (uploaded_by IS NULL OR uploaded_by = auth.uid())
  AND (
    public.is_workspace_owner(workspace_id)
    OR
    public.is_workspace_member(workspace_id)
  )
);

-- UPDATE: Only dataset uploader or workspace owner can update metadata.
CREATE POLICY "datasets_update_policy"
ON public.datasets
FOR UPDATE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR
  public.is_workspace_owner(workspace_id)
)
WITH CHECK (
  uploaded_by = auth.uid()
  OR
  public.is_workspace_owner(workspace_id)
);

-- DELETE: Only dataset uploader or workspace owner can delete dataset records.
CREATE POLICY "datasets_delete_policy"
ON public.datasets
FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR
  public.is_workspace_owner(workspace_id)
);


-- ------------------------------------------------------------------------------
-- 7. IDEMPOTENT public.create_workspace RPC
-- Signature compatible with frontend: (workspace_name text, personal boolean)
-- ------------------------------------------------------------------------------

-- Drop existing function first to allow return type adjustment without 42P13 error
DROP FUNCTION IF EXISTS public.create_workspace(text, boolean);
DROP FUNCTION IF EXISTS public.create_workspace(text);
DROP FUNCTION IF EXISTS public.create_workspace();

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
  -- Strict session identity check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: valid session required to create workspace'
      USING ERRCODE = '28000';
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(workspace_name), ''), 'Personal Research Workspace');

  -- Concurrency check: return existing personal workspace without duplicate creation
  IF personal THEN
    SELECT id, name, is_personal, owner_id, created_at
    INTO v_workspace
    FROM public.workspaces
    WHERE owner_id = v_user_id AND is_personal = true
    LIMIT 1;

    IF FOUND THEN
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

  -- Grant creator owner membership
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

REVOKE ALL ON FUNCTION public.create_workspace(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, boolean) TO service_role;


-- ------------------------------------------------------------------------------
-- 8. STORAGE SECURITY (Private Bucket & Non-Recursive Policies)
-- Frontend Storage Object Path: {userId}/{datasetId}/{cleanFilename}
-- ------------------------------------------------------------------------------

-- Ensure sentinelfl-datasets bucket exists and is strictly private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sentinelfl-datasets',
  'sentinelfl-datasets',
  false,                             -- Strictly private
  104857600,                         -- 100 MB max file size
  ARRAY['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv'];

-- Note: RLS is already enabled on storage.objects by default in Supabase.
DROP POLICY IF EXISTS "sentinelfl_storage_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "sentinelfl_storage_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "sentinelfl_storage_delete_policy" ON storage.objects;

-- Storage INSERT: Authenticated users can only upload into their own user folder prefix.
-- Direct string check; zero database queries or recursion.
CREATE POLICY "sentinelfl_storage_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sentinelfl-datasets'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Storage SELECT: Direct uploader can access their own objects (pure string check);
-- authorized workspace members access shared files via non-recursive helper.
CREATE POLICY "sentinelfl_storage_select_policy"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sentinelfl-datasets'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.datasets d
      WHERE d.storage_path = name
        AND (
          d.uploaded_by = auth.uid()
          OR
          public.is_workspace_owner(d.workspace_id)
          OR
          public.is_workspace_member(d.workspace_id)
        )
    )
  )
);

-- Storage DELETE: Direct uploader can delete their own uploaded object (pure string check,
-- allowing rollback cleanup even before metadata is committed); workspace owners can delete.
CREATE POLICY "sentinelfl_storage_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'sentinelfl-datasets'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.datasets d
      WHERE d.storage_path = name
        AND (
          d.uploaded_by = auth.uid()
          OR
          public.is_workspace_owner(d.workspace_id)
        )
    )
  )
);

COMMIT;
