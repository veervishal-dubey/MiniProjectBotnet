import { supabase } from '@/lib/supabase';
import { Dataset, ClassDistribution } from '@/types/dataset';
import { inspectCsvFile, ParsedCsvResult } from '@/lib/csvParser';

export const STORAGE_BUCKET_NAME = 'sentinelfl-datasets';
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const DISALLOWED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.py', '.js', '.dll', '.so',
  '.bin', '.msi', '.apk', '.scr', '.vbs', '.ps1', '.jar'
];

export interface UploadOptions {
  file: File;
  datasetName?: string;
  workspaceId: string;
  userId: string;
  onProgress?: (percent: number) => void;
}

/**
 * Validates file format, size, and disallows dangerous executables.
 */
export function validateUploadFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty (0 bytes). Cannot import empty dataset.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the maximum allowed limit of 100 MB.`,
    };
  }

  const nameLower = file.name.toLowerCase();
  for (const ext of DISALLOWED_EXTENSIONS) {
    if (nameLower.endsWith(ext)) {
      return {
        valid: false,
        error: `Executable and script file types (${ext}) are prohibited for security reasons. Only .csv and .txt network flow captures are supported.`,
      };
    }
  }

  if (!nameLower.endsWith('.csv') && !nameLower.endsWith('.txt')) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload a standard delimited .csv or .txt network flow dataset.',
    };
  }

  return { valid: true };
}

/**
 * Maps a database row from public.datasets into the frontend Dataset model.
 * Gracefully parses extended metadata from description JSON or dedicated columns.
 */
export function mapDatabaseRowToDataset(row: any): Dataset {
  let meta: Partial<Dataset> = {};
  let cleanDescription = row.description || '';

  if (cleanDescription.startsWith('{') && cleanDescription.endsWith('}')) {
    try {
      meta = JSON.parse(cleanDescription);
      cleanDescription = `Dataset: ${row.name} (${row.storage_path ? 'Stored in Supabase' : 'Direct upload'})`;
    } catch {
      // Keep description as raw string if not valid JSON
    }
  }

  return {
    id: row.id,
    name: row.name,
    filename: meta.filename || row.name,
    source: row.storage_path ? `Supabase Storage (${STORAGE_BUCKET_NAME})` : 'Supabase Database Record',
    sizeBytes: row.file_size || meta.sizeBytes || 0,
    rowCount: row.row_count || meta.rowCount || 0,
    columnCount: row.column_count || meta.columnCount || (meta.columns ? meta.columns.length : 0),
    labelColumn: row.label_column || meta.labelColumn || 'label',
    classDistribution: meta.classDistribution || [],
    status: (row.status === 'ready' || row.status === 'processing' || row.status === 'error') ? row.status : 'ready',
    createdAt: row.created_at || new Date().toISOString(),
    description: cleanDescription || `Flow capture imported to workspace on ${new Date(row.created_at || Date.now()).toLocaleDateString()}`,
    columns: meta.columns || [],
    previewRows: meta.previewRows || [],
    isDemoSample: false,
    storagePath: row.storage_path,
    workspaceId: row.workspace_id,
    uploadedBy: row.uploaded_by,
    fileFormat: row.file_format || meta.fileFormat || 'csv',
    iotStatus: row.iot_status || meta.iotStatus || 'not_inspected',
    iotFeatures: meta.iotFeatures,
    missingValuesTotal: meta.missingValuesTotal || 0,
    duplicateCount: meta.duplicateCount || 0,
  };
}

/**
 * Fetches all datasets belonging to the specified workspace under Supabase RLS.
 */
export async function fetchWorkspaceDatasets(workspaceId: string): Promise<Dataset[]> {
  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching workspace datasets:', error);
    throw new Error(`Failed to load workspace datasets: ${error.message}`);
  }

  if (!data) return [];
  return data.map(mapDatabaseRowToDataset);
}

/**
 * Uploads a validated dataset to private Supabase Storage and records metadata in public.datasets.
 * Enforces transaction-like rollback if metadata insertion fails.
 */
export async function uploadDatasetToSupabase(options: UploadOptions): Promise<Dataset> {
  const { file, datasetName, workspaceId, userId, onProgress } = options;

  // 1. Validation
  const val = validateUploadFile(file);
  if (!val.valid) {
    throw new Error(val.error);
  }

  onProgress?.(10);

  // 2. Browser-side CSV validation and inspection (without loading full file into memory)
  let parsed: ParsedCsvResult;
  try {
    parsed = await inspectCsvFile(file, 10);
  } catch (err: any) {
    throw new Error(`CSV Inspection failed: ${err.message}`);
  }

  onProgress?.(30);

  // Derive class distribution from preview rows
  const labelCol = parsed.detectedLabelColumn || 'label';
  const classCounts: Record<string, number> = {};
  parsed.rows.forEach(r => {
    const val = String(r[labelCol] ?? 'Unknown');
    classCounts[val] = (classCounts[val] || 0) + 1;
  });

  const totalInspected = Math.max(parsed.rows.length, 1);
  const classDistribution: ClassDistribution[] = Object.entries(classCounts).map(([className, count]) => ({
    className,
    count,
    percentage: +( (count / totalInspected) * 100).toFixed(1),
    isMalicious: !className.toLowerCase().includes('benign') && !className.toLowerCase().includes('normal'),
  }));

  // 3. Prepare unique storage object path: {userId}/{datasetId}/{cleanFilename}
  const datasetId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ds-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const cleanFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${datasetId}/${cleanFilename}`;

  onProgress?.(50);

  // 4. Upload file to private Supabase Storage bucket
  const { data: storageData, error: storageErr } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.name.endsWith('.csv') ? 'text/csv' : 'text/plain',
    });

  if (storageErr) {
    console.error('Storage upload error:', storageErr);
    if (storageErr.message?.includes('NoSuchBucket') || storageErr.message?.includes('Bucket not found')) {
      throw new Error(
        `Storage bucket "${STORAGE_BUCKET_NAME}" does not exist yet. Please execute the provided SQL migration in your Supabase SQL Editor to create the private bucket.`
      );
    }
    if (storageErr.message?.includes('row-level security') || storageErr.message?.includes('violates')) {
      throw new Error(
        'Upload denied by Supabase Storage RLS policy. Verify that you are authenticated and have run the storage migration.'
      );
    }
    throw new Error(`Failed to upload file to Supabase Storage: ${storageErr.message}`);
  }

  onProgress?.(80);

  // 5. Construct metadata JSON payload
  const displayName = datasetName && datasetName.trim()
    ? datasetName.trim()
    : file.name.replace(/\.[^/.]+$/, '');

  const metadataPayload = {
    filename: file.name,
    sizeBytes: file.size,
    fileFormat: file.name.endsWith('.txt') ? 'txt' : 'csv',
    rowCount: parsed.totalRows,
    columnCount: parsed.columns.length,
    labelColumn: labelCol,
    classDistribution,
    columns: parsed.columns,
    previewRows: parsed.rows,
    iotStatus: parsed.iotStatus,
    iotFeatures: parsed.iotFeatures,
    missingValuesTotal: parsed.missingValuesTotal,
    duplicateCount: parsed.duplicateCount,
    warnings: parsed.warnings,
  };

  const insertPayload = {
    id: datasetId,
    name: displayName,
    storage_path: storagePath,
    workspace_id: workspaceId,
    status: 'ready',
    uploaded_by: userId,
    description: JSON.stringify(metadataPayload),
  };

  // 6. Insert metadata into public.datasets using upsert to avoid duplicate records on retry
  const { data: insertedRows, error: dbErr } = await supabase
    .from('datasets')
    .upsert([insertPayload], { onConflict: 'id' })
    .select();

  if (dbErr) {
    console.error('Database insert error:', dbErr);

    // Rollback storage upload on database metadata failure only after verifying user ownership
    let cleanedUp = false;
    if (storagePath.startsWith(`${userId}/`)) {
      try {
        const { error: removeErr } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove([storagePath]);
        if (!removeErr) {
          cleanedUp = true;
          console.info(`Cleaned up orphaned storage object: ${storagePath}`);
        }
      } catch (cleanupErr) {
        console.warn('Failed to clean up storage object after database insert error:', cleanupErr);
      }
    }

    if (dbErr.message?.includes('infinite recursion')) {
      throw new Error(
        `Database RLS policy recursion detected: ${dbErr.message}. The relation "workspace_members" has recursive policy expressions. Please execute migration 03_fix_workspace_members_recursion.sql in your Supabase SQL Editor to resolve this.`
      );
    }

    throw new Error(`Failed to record dataset in database: ${dbErr.message}${cleanedUp ? ' (Storage object cleaned up)' : ''}`);
  }

  onProgress?.(100);

  const createdRow = insertedRows && insertedRows.length > 0 ? insertedRows[0] : insertPayload;
  return mapDatabaseRowToDataset(createdRow);
}

/**
 * Safely deletes a dataset from both public.datasets and private Supabase Storage.
 * Handles partial failures cleanly.
 */
export async function deleteDatasetFromSupabase(dataset: Dataset): Promise<{ success: boolean; storageDeleted: boolean; error?: string }> {
  let storageDeleted = false;

  // 1. Delete object from storage if path exists
  if (dataset.storagePath) {
    try {
      const { error: storageErr } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .remove([dataset.storagePath]);

      if (!storageErr) {
        storageDeleted = true;
      } else {
        console.warn('Storage removal warning (might have been removed already):', storageErr.message);
      }
    } catch (err) {
      console.warn('Failed to delete storage file:', err);
    }
  }

  // 2. Delete row from public.datasets table
  const { error: dbErr } = await supabase
    .from('datasets')
    .delete()
    .eq('id', dataset.id);

  if (dbErr) {
    console.error('Database deletion error:', dbErr);
    return {
      success: false,
      storageDeleted,
      error: `Could not delete dataset record: ${dbErr.message}`,
    };
  }

  return { success: true, storageDeleted };
}

/**
 * Generates a temporary signed URL or downloads the dataset blob for authenticated preview.
 */
export async function downloadDatasetBlob(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to retrieve dataset from storage: ${error?.message || 'Empty response'}`);
  }

  return data;
}
