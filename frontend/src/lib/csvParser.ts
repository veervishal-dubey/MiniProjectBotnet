import Papa from 'papaparse';
import { ColumnSchema, IotCompatibilityStatus, IotFeatureDetection } from '@/types/dataset';

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string | number | boolean | null>[];
  totalRows: number;
  columns: ColumnSchema[];
  detectedLabelColumn?: string;
  missingValuesTotal: number;
  duplicateCount: number;
  iotFeatures: IotFeatureDetection;
  iotStatus: IotCompatibilityStatus;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// IoT Network Traffic Feature Detection Rules
// -----------------------------------------------------------------------------
const IP_PATTERNS = [
  'src_ip', 'dst_ip', 'source_ip', 'destination_ip', 'saddr', 'daddr',
  'ipv4_src_addr', 'ipv4_dst_addr', 'ip_src', 'ip_dst', 'srcip', 'dstip'
];

const PORT_PATTERNS = [
  'src_port', 'dst_port', 'sport', 'dport', 'l4_src_port', 'l4_dst_port',
  'source_port', 'destination_port', 'srcport', 'dstport'
];

const PROTOCOL_PATTERNS = [
  'proto', 'protocol', 'proto_name', 'ip_proto', 'protocol_type'
];

const TRAFFIC_METRICS_PATTERNS = [
  'tot_fwd_pkts', 'tot_bwd_pkts', 'totlen_fwd_pkts', 'totlen_bwd_pkts',
  'fwd_pkt_len_mean', 'bwd_pkt_len_mean', 'flow_bytes_s', 'flow_pkts_s',
  'bytes', 'pkts', 'packets', 'byte_count', 'packet_count', 'flow_bytes',
  'fwd_pkts', 'bwd_pkts', 'rate', 'sbytes', 'dbytes', 'spkts', 'dpkts'
];

const DURATION_PATTERNS = [
  'flow_duration', 'duration', 'dur', 'flow_dur', 'time_duration'
];

const LABEL_PATTERNS = [
  'label', 'class', 'attack', 'category', 'sub_category',
  'attack_type', 'target', 'is_attack', 'threat_type', 'anomaly'
];

export function detectIotFeatures(headers: string[]): IotFeatureDetection {
  const normalized = headers.map(h => h.trim().toLowerCase());
  const detectedFeatures: string[] = [];

  const hasIpAddresses = normalized.some(h => IP_PATTERNS.some(p => h.includes(p)));
  if (hasIpAddresses) detectedFeatures.push('IP Addresses');

  const hasPorts = normalized.some(h => PORT_PATTERNS.some(p => h.includes(p)));
  if (hasPorts) detectedFeatures.push('Transport Ports');

  const hasProtocol = normalized.some(h => PROTOCOL_PATTERNS.some(p => h === p || h.includes(p)));
  if (hasProtocol) detectedFeatures.push('Network Protocol');

  const hasTrafficMetrics = normalized.some(h => TRAFFIC_METRICS_PATTERNS.some(p => h.includes(p)));
  if (hasTrafficMetrics) detectedFeatures.push('Flow Metrics / Packet Counts');

  const hasDuration = normalized.some(h => DURATION_PATTERNS.some(p => h.includes(p)));
  if (hasDuration) detectedFeatures.push('Flow Duration');

  const hasLabel = normalized.some(h => LABEL_PATTERNS.some(p => h === p || h.includes(p)));
  if (hasLabel) detectedFeatures.push('Classification Label / Target');

  return {
    hasIpAddresses,
    hasPorts,
    hasProtocol,
    hasTrafficMetrics,
    hasDuration,
    hasLabel,
    detectedFeatures,
  };
}

/**
 * Sanitizes cell values to prevent CSV formula injection when viewed
 * and ensures safe JavaScript representation.
 */
export function sanitizeCellValue(val: unknown): string | number | boolean | null {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'boolean') {
    return val;
  }

  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'none') {
    return null;
  }
  if (str.toLowerCase() === 'true') return true;
  if (str.toLowerCase() === 'false') return false;

  // Check if purely numeric
  if (!isNaN(Number(str)) && !str.includes(':') && !str.startsWith('0x') && str.length < 20) {
    const num = Number(str);
    if (Number.isFinite(num)) return num;
  }

  // Prevent formula injection if exported or viewed
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    return `'${str}`;
  }

  return str;
}

/**
 * Check if column name suggests it is a classification target
 */
function isLikelyTarget(colName: string): boolean {
  const lower = colName.trim().toLowerCase();
  return LABEL_PATTERNS.some(p => lower === p || lower.includes(p));
}

/**
 * Safely inspects a CSV File without loading arbitrarily large files into memory.
 * Uses PapaParse chunking or slicing for files up to 100MB.
 */
export async function inspectCsvFile(file: File, maxPreviewRows = 10): Promise<ParsedCsvResult> {
  const warnings: string[] = [];

  if (file.size === 0) {
    throw new Error('The selected file is empty (0 bytes). Please upload a valid CSV flow capture.');
  }

  // If file is very large (e.g. > 2MB), inspect the head chunk (2MB) for structure and schema
  // to prevent locking the browser UI thread
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
  const isChunked = file.size > CHUNK_SIZE;
  const inspectBlob = isChunked ? file.slice(0, CHUNK_SIZE) : file;

  const inspectText = await readFileAsText(inspectBlob);

  if (!inspectText.trim()) {
    throw new Error('CSV content could not be read or is empty.');
  }

  const parsed = Papa.parse<Record<string, unknown>>(inspectText, {
    header: true,
    skipEmptyLines: 'greedy',
    preview: 150, // Inspect first 150 rows for statistics
  });

  if (parsed.errors && parsed.errors.length > 0) {
    const fatal = parsed.errors.find(e => e.type === 'Delimiter' || e.code === 'UndetectableDelimiter');
    if (fatal) {
      throw new Error(`CSV Parsing failed: ${fatal.message}`);
    }
    warnings.push(`Detected ${parsed.errors.length} formatting warnings in initial sample.`);
  }

  const headers = (parsed.meta.fields || []).map(h => h.trim()).filter(h => h.length > 0);
  if (headers.length === 0) {
    throw new Error('No valid columns or headers detected in CSV file.');
  }

  const rawRows = parsed.data || [];
  if (rawRows.length === 0) {
    throw new Error('CSV file contains headers but no data rows.');
  }

  // Calculate total rows estimate or exact
  let estimatedTotalRows = rawRows.length;
  if (isChunked) {
    // Estimate total rows based on average byte length per row in the 2MB chunk
    const bytesInChunk = inspectBlob.size;
    const avgBytesPerRow = bytesInChunk / Math.max(rawRows.length, 1);
    estimatedTotalRows = Math.max(rawRows.length, Math.round(file.size / avgBytesPerRow));
    warnings.push(`Large file (${(file.size / 1024 / 1024).toFixed(1)} MB): Schema analyzed from 2MB header sample. Total rows (~${estimatedTotalRows.toLocaleString()}) estimated.`);
  }

  // Sanitize preview rows (limit to first maxPreviewRows, typically 10)
  const previewRows: Record<string, string | number | boolean | null>[] = [];
  const previewLimit = Math.min(rawRows.length, maxPreviewRows);

  for (let i = 0; i < previewLimit; i++) {
    const raw = rawRows[i];
    const sanitizedRow: Record<string, string | number | boolean | null> = {};
    headers.forEach(h => {
      sanitizedRow[h] = sanitizeCellValue(raw[h]);
    });
    previewRows.push(sanitizedRow);
  }

  // Compute column schemas across the inspected sample rows
  let missingValuesTotal = 0;
  const sampleRowsForStats = rawRows.slice(0, 100);

  const columns: ColumnSchema[] = headers.map(header => {
    let nullCount = 0;
    const valuesList: (string | number | boolean | null)[] = [];
    let isNumeric = true;
    let hasDecimals = false;

    sampleRowsForStats.forEach(row => {
      const v = sanitizeCellValue(row[header]);
      if (v === null) {
        nullCount++;
        missingValuesTotal++;
      } else {
        valuesList.push(v);
        if (typeof v !== 'number') {
          isNumeric = false;
        } else if (!Number.isInteger(v)) {
          hasDecimals = true;
        }
      }
    });

    const uniqueCount = new Set(valuesList).size;

    let dtype: ColumnSchema['dtype'] = 'object';
    if (isNumeric && valuesList.length > 0) {
      dtype = hasDecimals ? 'float64' : 'int64';
    } else if (valuesList.every(v => typeof v === 'boolean')) {
      dtype = 'bool';
    }

    const colSchema: ColumnSchema = {
      name: header,
      dtype,
      nullCount,
      uniqueCount,
      isTarget: isLikelyTarget(header),
    };

    if (isNumeric && valuesList.length > 0) {
      const nums = valuesList as number[];
      colSchema.min = Math.min(...nums);
      colSchema.max = Math.max(...nums);
      colSchema.mean = +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3);
    }

    return colSchema;
  });

  // Check duplicate rows in sample
  const rowSignatures = new Set<string>();
  let duplicateCount = 0;
  sampleRowsForStats.forEach(row => {
    const sig = headers.map(h => String(row[h])).join('|');
    if (rowSignatures.has(sig)) {
      duplicateCount++;
    } else {
      rowSignatures.add(sig);
    }
  });

  const detectedLabelColumn = columns.find(c => c.isTarget)?.name || headers[headers.length - 1];

  // IoT compatibility assessment
  const iotFeatures = detectIotFeatures(headers);
  let iotStatus: IotCompatibilityStatus = 'not_inspected';

  if (headers.length < 2) {
    iotStatus = 'inspection_failed';
    warnings.push('Dataset contains fewer than 2 columns; insufficient for feature extraction.');
  } else if (!iotFeatures.hasLabel) {
    iotStatus = 'needs_attention';
    warnings.push('No obvious classification label/target column detected (e.g. "label", "attack", "class"). Manual target selection may be required in Preprocessing.');
  } else if (!iotFeatures.hasTrafficMetrics && !iotFeatures.hasIpAddresses && !iotFeatures.hasPorts) {
    iotStatus = 'needs_attention';
    warnings.push('No standard IoT network flow headers recognized. Ensure features are numeric for federated model training.');
  } else {
    iotStatus = 'ready_for_preprocessing';
  }

  return {
    headers,
    rows: previewRows,
    totalRows: estimatedTotalRows,
    columns,
    detectedLabelColumn,
    missingValuesTotal,
    duplicateCount,
    iotFeatures,
    iotStatus,
    warnings,
  };
}

/**
 * Backward compatible parseCsvContent for raw string input
 */
export function parseCsvContent(csvText: string, maxPreviewRows = 100): ParsedCsvResult {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    preview: 150,
  });

  const headers = (parsed.meta.fields || []).map(h => h.trim()).filter(h => h.length > 0);
  const rawRows = parsed.data || [];
  const totalRows = rawRows.length;

  const previewCount = Math.min(totalRows, maxPreviewRows);
  const rows: Record<string, string | number | boolean | null>[] = [];

  for (let i = 0; i < previewCount; i++) {
    const raw = rawRows[i];
    const sanitizedRow: Record<string, string | number | boolean | null> = {};
    headers.forEach(h => {
      sanitizedRow[h] = sanitizeCellValue(raw[h]);
    });
    rows.push(sanitizedRow);
  }

  let missingValuesTotal = 0;
  const columns: ColumnSchema[] = headers.map(header => {
    let nullCount = 0;
    const valuesList: (string | number | boolean | null)[] = [];
    let isNumeric = true;
    let hasDecimals = false;

    rows.forEach(row => {
      const v = row[header];
      if (v === null) {
        nullCount++;
        missingValuesTotal++;
      } else {
        valuesList.push(v);
        if (typeof v !== 'number') {
          isNumeric = false;
        } else if (!Number.isInteger(v)) {
          hasDecimals = true;
        }
      }
    });

    const uniqueCount = new Set(valuesList).size;
    let dtype: ColumnSchema['dtype'] = 'object';
    if (isNumeric && valuesList.length > 0) {
      dtype = hasDecimals ? 'float64' : 'int64';
    } else if (valuesList.every(v => typeof v === 'boolean')) {
      dtype = 'bool';
    }

    const colSchema: ColumnSchema = {
      name: header,
      dtype,
      nullCount,
      uniqueCount,
      isTarget: isLikelyTarget(header),
    };

    if (isNumeric && valuesList.length > 0) {
      const nums = valuesList as number[];
      colSchema.min = Math.min(...nums);
      colSchema.max = Math.max(...nums);
      colSchema.mean = +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3);
    }

    return colSchema;
  });

  const detectedLabelColumn = columns.find(c => c.isTarget)?.name || headers[headers.length - 1];
  const iotFeatures = detectIotFeatures(headers);
  const iotStatus: IotCompatibilityStatus = iotFeatures.hasLabel ? 'ready_for_preprocessing' : 'needs_attention';

  return {
    headers,
    rows,
    totalRows,
    columns,
    detectedLabelColumn,
    missingValuesTotal,
    duplicateCount: 0,
    iotFeatures,
    iotStatus,
    warnings: [],
  };
}

function readFileAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsText(blob);
  });
}
