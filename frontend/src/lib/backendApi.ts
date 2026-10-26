import { supabase } from '@/lib/supabase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export interface ColumnDetailDto {
  name: string;
  data_type: string;
  inferred_pandas_type: string;
  missing_count: number;
  missing_percentage: number;
  unique_count: number;
  is_constant: boolean;
  sample_values: any[];
}

export interface ClassDistributionDto {
  class_name: string;
  count: number;
  percentage: number;
  is_malicious?: boolean;
}

export interface ValidationReportDto {
  file_name: string;
  file_size_bytes: number;
  is_valid: boolean;
  error_message?: string;
  total_rows: number;
  total_columns: number;
  columns: ColumnDetailDto[];
  duplicate_column_names: string[];
  duplicate_row_count: number;
  constant_columns: string[];
  missing_values_total: number;
  missing_values_percentage: number;
  numerical_columns: string[];
  categorical_columns: string[];
  suggested_label_columns: string[];
  detected_label_column?: string;
  class_distribution?: ClassDistributionDto[];
  warnings: string[];
  preview_rows: Record<string, any>[];
}

export interface PreprocessingReportDto {
  job_id: string;
  dataset_id: string;
  status: string;
  original_rows: number;
  original_columns: number;
  processed_rows: number;
  processed_columns: number;
  feature_names: string[];
  target_name?: string;
  target_classes?: string[];
  train_rows: number;
  val_rows: number;
  test_rows: number;
  operations_performed: string[];
  columns_removed: Record<string, string>;
  remaining_missing_values: number;
  warnings: string[];
  error_message?: string;
  processed_file_path?: string;
  execution_time_seconds: number;
  created_at: string;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function checkBackendHealth(): Promise<{ healthy: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) {
      return { healthy: false, error: `Backend returned status ${res.status}` };
    }
    const data = await res.json();
    return { healthy: data.status === 'healthy', data };
  } catch (err: any) {
    return { healthy: false, error: err.message || 'Cannot reach FastAPI backend server.' };
  }
}

export async function validateDatasetApi(
  datasetId: string,
  labelColumn?: string
): Promise<ValidationReportDto> {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_BASE_URL}/api/v1/datasets/${encodeURIComponent(datasetId)}/validate`);
  if (labelColumn) {
    url.searchParams.set('label_column', labelColumn);
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Dataset validation failed with status ${res.status}`);
  }

  return await res.json();
}

export async function previewDatasetApi(
  datasetId: string,
  previewLimit: number = 10
): Promise<ValidationReportDto> {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_BASE_URL}/api/v1/datasets/${encodeURIComponent(datasetId)}/preview`);
  url.searchParams.set('preview_limit', String(previewLimit));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Preview failed with status ${res.status}`);
  }

  return await res.json();
}

export async function executePreprocessingApi(params: {
  datasetId: string;
  targetColumn?: string;
  selectedFeatures?: string[];
  dropColumns?: string[];
  dropDuplicates?: boolean;
  imputationStrategy?: string;
  scalingMethod?: string;
  categoricalEncoding?: string;
  removeZeroVariance?: boolean;
  trainRatio?: number;
  valRatio?: number;
  testRatio?: number;
  randomSeed?: number;
  stratify?: boolean;
}): Promise<PreprocessingReportDto> {
  const headers = await getAuthHeaders();
  (headers as Record<string, string>)['Content-Type'] = 'application/json';

  const body = {
    dataset_id: params.datasetId,
    target_column: params.targetColumn || null,
    selected_features: params.selectedFeatures || null,
    drop_columns: params.dropColumns || [],
    drop_duplicates: params.dropDuplicates ?? true,
    imputation_strategy: params.imputationStrategy || 'median',
    scaling_method: params.scalingMethod || 'robust',
    categorical_encoding: params.categoricalEncoding || 'onehot',
    remove_zero_variance: params.removeZeroVariance ?? true,
    train_ratio: params.trainRatio ?? 0.70,
    val_ratio: params.valRatio ?? 0.15,
    test_ratio: params.testRatio ?? 0.15,
    random_seed: params.randomSeed ?? 42,
    stratify: params.stratify ?? true,
  };

  const res = await fetch(`${API_BASE_URL}/api/v1/preprocessing/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Preprocessing failed with status ${res.status}`);
  }

  return await res.json();
}

export async function downloadProcessedDatasetBlob(
  jobId: string,
  split: 'full' | 'train' | 'test' = 'full'
): Promise<{ blob: Blob; filename: string }> {
  const headers = await getAuthHeaders();
  const url = `${API_BASE_URL}/api/v1/preprocessing/jobs/${encodeURIComponent(jobId)}/download?split=${split}`;

  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Download failed with status ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  let filename = `sentinelfl_${jobId}_${split}.csv`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  return { blob, filename };
}
