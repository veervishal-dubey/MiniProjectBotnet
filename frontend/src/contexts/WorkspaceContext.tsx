import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Workspace, WorkspaceCounts } from '@/types/workspace';

interface WorkspaceContextType {
  workspace: Workspace | null;
  counts: WorkspaceCounts;
  isLoadingWorkspace: boolean;
  workspaceError: string | null;
  refreshWorkspace: () => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const INITIAL_COUNTS: WorkspaceCounts = {
  datasetCount: 0,
  preprocessingCount: 0,
  modelCount: 0,
  federatedRoundCount: 0,
};

// In-memory request deduplication map to prevent duplicate concurrent workspace creations
const inFlightWorkspaceRequests = new Map<string, Promise<Workspace | null>>();

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [counts, setCounts] = useState<WorkspaceCounts>(INITIAL_COUNTS);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState<boolean>(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const activeUserIdRef = useRef<string | null>(null);

  const fetchWorkspaceCounts = useCallback(async (wsId: string): Promise<WorkspaceCounts> => {
    let datasetCount = 0;
    let preprocessingCount = 0;
    let modelCount = 0;
    let federatedRoundCount = 0;

    try {
      // 1. Dataset count strictly scoped to active workspace
      const { count: dsCount, error: dsErr } = await supabase
        .from('datasets')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId);

      if (!dsErr && dsCount !== null) {
        datasetCount = dsCount;
      }

      // 2. Preprocessing jobs count scoped to datasets in active workspace
      const { count: prepCount, error: prepErr } = await supabase
        .from('preprocessing_jobs')
        .select('id, datasets!inner(workspace_id)', { count: 'exact', head: true })
        .eq('datasets.workspace_id', wsId);

      if (!prepErr && prepCount !== null) {
        preprocessingCount = prepCount;
      } else {
        // Fallback for direct workspace_id if present
        const { count: directPrep, error: directPrepErr } = await supabase
          .from('preprocessing_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId);
        if (!directPrepErr && directPrep !== null) {
          preprocessingCount = directPrep;
        }
      }

      // 3. Model runs count strictly scoped to active workspace
      const { count: mdCount, error: mdErr } = await supabase
        .from('model_runs')
        .select('id, datasets!inner(workspace_id)', { count: 'exact', head: true })
        .eq('datasets.workspace_id', wsId);

      if (!mdErr && mdCount !== null) {
        modelCount = mdCount;
      }

      // 4. Federated learning rounds count strictly scoped to active workspace
      const { count: flCount, error: flErr } = await supabase
        .from('federated_rounds')
        .select('id, datasets!inner(workspace_id)', { count: 'exact', head: true })
        .eq('datasets.workspace_id', wsId);

      if (!flErr && flCount !== null) {
        federatedRoundCount = flCount;
      } else {
        // Fallback for direct workspace_id if present on table
        const { count: flDirect, error: flDirErr } = await supabase
          .from('federated_rounds')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId);
        if (!flDirErr && flDirect !== null) {
          federatedRoundCount = flDirect;
        }
      }
    } catch (err) {
      console.warn('Error fetching workspace counts:', err);
    }

    return {
      datasetCount,
      preprocessingCount,
      modelCount,
      federatedRoundCount,
    };
  }, []);

  const loadPersonalWorkspace = useCallback(async (userId: string, userName?: string): Promise<Workspace | null> => {
    // 1. First, check if the authenticated researcher already has a personal or owned workspace
    try {
      const { data: existingWorkspaces, error: selectErr } = await supabase
        .from('workspaces')
        .select('id, name, is_personal, owner_id, created_at')
        .order('created_at', { ascending: true });

      if (!selectErr && existingWorkspaces && existingWorkspaces.length > 0) {
        // Prefer personal workspace or workspace owned by current user
        const personal = existingWorkspaces.find(
          w => w.is_personal === true || w.owner_id === userId
        ) || existingWorkspaces[0];

        return personal;
      }
    } catch (err) {
      console.warn('Workspace selection error:', err);
    }

    // 2. No workspace found; invoke existing RPC public.create_workspace(workspace_name, personal)
    const defaultWorkspaceName = userName
      ? `${userName}'s Workspace`
      : 'Personal Research Workspace';

    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('create_workspace', {
        workspace_name: defaultWorkspaceName,
        personal: true,
      });

      if (!rpcErr && rpcResult) {
        if (typeof rpcResult === 'object' && rpcResult !== null) {
          if ('id' in rpcResult) {
            return rpcResult as Workspace;
          } else if (Array.isArray(rpcResult) && rpcResult.length > 0) {
            return rpcResult[0] as Workspace;
          }
        } else if (typeof rpcResult === 'string') {
          // If the RPC returns a UUID scalar
          return {
            id: rpcResult,
            name: defaultWorkspaceName,
            is_personal: true,
            owner_id: userId,
            created_at: new Date().toISOString(),
          };
        }
      }

      if (rpcErr) {
        console.warn('public.create_workspace RPC returned error:', rpcErr.message);
      }

      // Re-query in case trigger or RPC inserted the row
      const { data: refetched } = await supabase
        .from('workspaces')
        .select('id, name, is_personal, owner_id, created_at')
        .order('created_at', { ascending: true })
        .limit(1);

      if (refetched && refetched.length > 0) {
        return refetched[0];
      }
    } catch (err) {
      console.warn('RPC invocation error:', err);
    }

    // 3. Graceful fallback if RPC is blocked by database permissions awaiting migration
    return {
      id: `personal-ws-${userId.slice(0, 8)}`,
      name: defaultWorkspaceName,
      is_personal: true,
      owner_id: userId,
      created_at: new Date().toISOString(),
      isFallback: true,
    };
  }, []);

  const initOrRefresh = useCallback(async () => {
    if (!user) {
      setWorkspace(null);
      setCounts(INITIAL_COUNTS);
      setIsLoadingWorkspace(false);
      setWorkspaceError(null);
      return;
    }

    setIsLoadingWorkspace(true);
    setWorkspaceError(null);

    const userId = user.id;
    activeUserIdRef.current = userId;

    // Check if another request for this user is already in flight (deduplication)
    let requestPromise = inFlightWorkspaceRequests.get(userId);
    if (!requestPromise) {
      requestPromise = loadPersonalWorkspace(userId, profile?.name);
      inFlightWorkspaceRequests.set(userId, requestPromise);
    }

    try {
      const resolvedWs = await requestPromise;

      // Ensure the user hasn't switched accounts while the request was in flight
      if (activeUserIdRef.current !== userId) return;

      setWorkspace(resolvedWs);

      if (resolvedWs) {
        const actualCounts = await fetchWorkspaceCounts(resolvedWs.id);
        if (activeUserIdRef.current === userId) {
          setCounts(actualCounts);
        }
      }
    } catch (err: unknown) {
      if (activeUserIdRef.current === userId) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize workspace';
        setWorkspaceError(msg);
      }
    } finally {
      inFlightWorkspaceRequests.delete(userId);
      if (activeUserIdRef.current === userId) {
        setIsLoadingWorkspace(false);
      }
    }
  }, [user, profile?.name, loadPersonalWorkspace, fetchWorkspaceCounts]);

  useEffect(() => {
    initOrRefresh();

    return () => {
      // Clean up on unmount or account switch
      if (user?.id) {
        inFlightWorkspaceRequests.delete(user.id);
      }
    };
  }, [user?.id, initOrRefresh]);

  const refreshCounts = useCallback(async () => {
    if (workspace) {
      const updatedCounts = await fetchWorkspaceCounts(workspace.id);
      setCounts(updatedCounts);
    }
  }, [workspace, fetchWorkspaceCounts]);

  const refreshWorkspace = useCallback(async () => {
    await initOrRefresh();
  }, [initOrRefresh]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        counts,
        isLoadingWorkspace,
        workspaceError,
        refreshWorkspace,
        refreshCounts,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
