export interface ColumnSchema {
  name: string;
  dtype: 'float64' | 'int64' | 'object' | 'bool' | 'datetime';
  nullCount: number;
  uniqueCount: number;
  isTarget?: boolean;
  min?: number;
  max?: number;
  mean?: number;
}

export interface ClassDistribution {
  className: string;
  count: number;
  percentage: number;
  isMalicious: boolean;
}

export type IotCompatibilityStatus = 
  | 'not_inspected'
  | 'inspection_failed'
  | 'needs_attention'
  | 'ready_for_preprocessing';

export interface IotFeatureDetection {
  hasIpAddresses: boolean;
  hasPorts: boolean;
  hasProtocol: boolean;
  hasTrafficMetrics: boolean;
  hasDuration: boolean;
  hasLabel: boolean;
  detectedFeatures: string[];
}

export interface Dataset {
  id: string;
  name: string;
  filename: string;
  source: string;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  labelColumn: string;
  classDistribution: ClassDistribution[];
  status: 'ready' | 'previewing' | 'processing' | 'error';
  createdAt: string;
  description: string;
  columns: ColumnSchema[];
  previewRows: Record<string, string | number | boolean | null>[];
  isDemoSample?: boolean;
  // Supabase Storage & Workspace fields
  storagePath?: string;
  workspaceId?: string;
  uploadedBy?: string;
  fileFormat?: string;
  iotStatus?: IotCompatibilityStatus;
  iotFeatures?: IotFeatureDetection;
  missingValuesTotal?: number;
  duplicateCount?: number;
}
