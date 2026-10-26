export interface Workspace {
  id: string;
  name: string;
  is_personal: boolean;
  owner_id: string;
  created_at: string;
  isFallback?: boolean;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
}

export interface WorkspaceCounts {
  datasetCount: number;
  preprocessingCount: number;
  modelCount: number;
  federatedRoundCount: number;
}
