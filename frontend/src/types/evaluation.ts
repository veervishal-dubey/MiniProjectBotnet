export interface ConfusionMatrixData {
  classes: string[];
  matrix: number[][]; // normalized or count
  totalSamples: number;
}

export interface ClassEvaluationDetail {
  className: string;
  precision: number;
  recall: number;
  f1Score: number;
  support: number;
  falsePositiveRate: number;
}

export interface EvaluationExperiment {
  id: string;
  name: string;
  category: 'centralized' | 'federated_iid' | 'federated_non_iid' | 'local_client';
  modelArchitecture: string;
  datasetName: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  trainingTimeSec: number;
  inferenceLatencyMs: number;
  dataTransferredMb: number;
  clientCount: number;
  confusionMatrix: ConfusionMatrixData;
  perClassPerformance: ClassEvaluationDetail[];
  evaluatedAt: string;
  isBaseline?: boolean;
}
