export type ModelArchitecture =
  | 'random_forest'
  | 'logistic_regression'
  | 'federated_mlp'
  | 'federated_cnn'
  | 'centralized_baseline'
  | string;

export type ModelParadigm = 'centralized' | 'federated_global' | 'client_local';

export type ModelStatus = 'trained' | 'training' | 'staged' | 'archived' | 'failed' | 'completed';

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  f1_score?: number;
  loss?: number;
  trainingTimeSec?: number;
  training_time_sec?: number;
  inferenceLatencyMs?: number;
  inference_latency_ms?: number;
  falsePositiveRate?: number;
  false_positive_rate?: number;
  [key: string]: any;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface ModelItem {
  id: string;
  name: string;
  version: string;
  paradigm: ModelParadigm;
  architecture: ModelArchitecture;
  datasetUsed: string;
  datasetId?: string;
  targetTask: 'binary' | 'multiclass' | string;
  trainingDate: string;
  status: 'trained' | 'training' | 'staged' | 'archived' | 'failed';
  rawStatus?: string;
  metrics: ModelMetrics;
  hyperparameters: Record<string, any>;
  artifactPath?: string;
  featuresUsed?: string[];
  topFeatures?: FeatureImportance[];
  isDemoSample?: boolean;
  createdBy?: string;
}
