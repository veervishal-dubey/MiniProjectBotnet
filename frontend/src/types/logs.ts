export type LogSeverity = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogCategory = 'SYSTEM' | 'DATASET' | 'PREPROCESSING' | 'TRAINING' | 'FEDERATED' | 'DETECTION';

export interface LogEntry {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  category: LogCategory;
  message: string;
  component: string;
  details?: Record<string, string | number | boolean | null>;
  experimentId?: string;
  isSyntheticDemo: boolean;
}
