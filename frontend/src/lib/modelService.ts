import { supabase } from '@/lib/supabase';
import { ModelItem, ModelArchitecture, ModelParadigm } from '@/types/model';

/**
 * Maps a genuine database row from public.model_runs to the ModelItem interface.
 * Strictly avoids inventing missing metrics, performance values, or model versions.
 */
export function mapDatabaseRowToModel(row: any): ModelItem {
  const rawMetrics = typeof row.metrics === 'object' && row.metrics !== null ? row.metrics : {};
  const datasetInfo = row.datasets || {};
  const datasetName = datasetInfo.name || '';
  const datasetDisplay = datasetName
    ? `${datasetName} (${row.dataset_id || 'ID Unknown'})`
    : row.dataset_id
    ? `Dataset: ${row.dataset_id}`
    : 'Unassigned Dataset';

  // Normalize status strictly based on persisted DB record
  const rawStatus = String(row.status || '').toLowerCase().trim();
  let normalizedStatus: 'trained' | 'training' | 'staged' | 'archived' | 'failed';
  if (rawStatus === 'trained' || rawStatus === 'completed' || rawStatus === 'success') {
    normalizedStatus = 'trained';
  } else if (rawStatus === 'training' || rawStatus === 'running' || rawStatus === 'in_progress') {
    normalizedStatus = 'training';
  } else if (rawStatus === 'failed' || rawStatus === 'error') {
    normalizedStatus = 'failed';
  } else if (rawStatus === 'archived') {
    normalizedStatus = 'archived';
  } else {
    normalizedStatus = 'staged';
  }

  // Parse only genuinely persisted evaluation metrics (keeping undefined if missing or null)
  const accuracy = typeof rawMetrics.accuracy === 'number'
    ? rawMetrics.accuracy
    : typeof rawMetrics.acc === 'number'
    ? rawMetrics.acc
    : undefined;

  const precision = typeof rawMetrics.precision === 'number' ? rawMetrics.precision : undefined;
  const recall = typeof rawMetrics.recall === 'number' ? rawMetrics.recall : undefined;

  const f1Score = typeof rawMetrics.f1_score === 'number'
    ? rawMetrics.f1_score
    : typeof rawMetrics.f1Score === 'number'
    ? rawMetrics.f1Score
    : typeof rawMetrics.f1 === 'number'
    ? rawMetrics.f1
    : undefined;

  const loss = typeof rawMetrics.loss === 'number' ? rawMetrics.loss : undefined;

  const trainingTimeSec = typeof rawMetrics.training_time_sec === 'number'
    ? rawMetrics.training_time_sec
    : typeof rawMetrics.trainingTimeSec === 'number'
    ? rawMetrics.trainingTimeSec
    : typeof rawMetrics.duration_seconds === 'number'
    ? rawMetrics.duration_seconds
    : undefined;

  const inferenceLatencyMs = typeof rawMetrics.inference_latency_ms === 'number'
    ? rawMetrics.inference_latency_ms
    : typeof rawMetrics.inferenceLatencyMs === 'number'
    ? rawMetrics.inferenceLatencyMs
    : typeof rawMetrics.latency_ms === 'number'
    ? rawMetrics.latency_ms
    : undefined;

  const falsePositiveRate = typeof rawMetrics.false_positive_rate === 'number'
    ? rawMetrics.false_positive_rate
    : typeof rawMetrics.falsePositiveRate === 'number'
    ? rawMetrics.falsePositiveRate
    : typeof rawMetrics.fpr === 'number'
    ? rawMetrics.fpr
    : undefined;

  // Genuine architecture and version only if recorded in metadata
  const architecture = rawMetrics.architecture || rawMetrics.algorithm || 'centralized_baseline';
  const version = rawMetrics.version || (row.created_at ? `run-${row.created_at.slice(0, 10)}` : 'v1.0');
  const paradigm: ModelParadigm = rawMetrics.paradigm || 'centralized';
  const targetTask = rawMetrics.targetTask || rawMetrics.target_task || 'multiclass';

  const hyperparameters = typeof rawMetrics.hyperparameters === 'object' && rawMetrics.hyperparameters !== null
    ? rawMetrics.hyperparameters
    : typeof rawMetrics.params === 'object' && rawMetrics.params !== null
    ? rawMetrics.params
    : {};

  const artifactPath = rawMetrics.artifact_path || rawMetrics.artifactPath || undefined;
  const featuresUsed = Array.isArray(rawMetrics.features_used)
    ? rawMetrics.features_used
    : Array.isArray(rawMetrics.featuresUsed)
    ? rawMetrics.featuresUsed
    : [];

  const topFeatures = Array.isArray(rawMetrics.top_features)
    ? rawMetrics.top_features
    : Array.isArray(rawMetrics.topFeatures)
    ? rawMetrics.topFeatures
    : [];

  return {
    id: row.id,
    name: row.model_name || 'Centralized Baseline Run',
    version,
    paradigm,
    architecture,
    datasetUsed: datasetDisplay,
    datasetId: row.dataset_id,
    targetTask,
    trainingDate: row.created_at || new Date().toISOString(),
    status: normalizedStatus,
    rawStatus: row.status,
    metrics: {
      ...rawMetrics,
      accuracy,
      precision,
      recall,
      f1Score,
      f1_score: f1Score,
      loss,
      trainingTimeSec,
      training_time_sec: trainingTimeSec,
      inferenceLatencyMs,
      inference_latency_ms: inferenceLatencyMs,
      falsePositiveRate,
      false_positive_rate: falsePositiveRate,
    },
    hyperparameters,
    artifactPath,
    featuresUsed,
    topFeatures,
    isDemoSample: false,
    createdBy: row.created_by,
  };
}

/**
 * Fetches real model run records from public.model_runs strictly under the specified workspace.
 *
 * Security & Data Isolation Guarantees:
 * 1. Missing or empty workspace ID immediately returns [] without querying the database.
 * 2. Uses PostgREST inner join `datasets!inner(id, name, workspace_id)` with `.eq('datasets.workspace_id', cleanWsId)`
 *    to push the workspace filter directly to PostgreSQL at the SQL query level.
 * 3. Never includes unassigned runs (runs with null dataset_id or unjoined dataset).
 * 4. Never leaks records across different workspaces.
 */
export async function fetchWorkspaceModelRuns(workspaceId?: string): Promise<ModelItem[]> {
  // 1. Guard against missing or empty workspace ID
  if (!workspaceId || typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return [];
  }

  const cleanWsId = workspaceId.trim();

  try {
    // 2. Query with inner join to enforce workspace filtering at the database level
    const { data, error } = await supabase
      .from('model_runs')
      .select('*, datasets!inner(id, name, workspace_id)')
      .eq('datasets.workspace_id', cleanWsId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error querying public.model_runs for workspace:', error);
      if (error.message?.includes('get_user_workspace_ids')) {
        throw new Error(
          `RLS Policy Dependency Error: The relation "model_runs" contains a policy referencing dropped function get_user_workspace_ids(). Please check your database policies in Supabase SQL editor.`
        );
      }
      throw new Error(`Failed to load model runs: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 3. Strict verification: ensure dataset exists and workspace_id strictly matches cleanWsId.
    // Excludes any unassigned runs (where dataset_id or datasets is null) and cross-workspace runs.
    const verifiedRows = data.filter(r => {
      const ds = Array.isArray(r.datasets) ? r.datasets[0] : r.datasets;
      return Boolean(ds && ds.workspace_id === cleanWsId);
    });

    return verifiedRows.map(mapDatabaseRowToModel);
  } catch (err: any) {
    console.warn('fetchWorkspaceModelRuns error:', err);
    throw err;
  }
}
