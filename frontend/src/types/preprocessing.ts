export type ScalingMethod = 'standard' | 'robust' | 'minmax' | 'none';
export type CategoricalEncoding = 'onehot' | 'ordinal' | 'none';
export type ImputationStrategy = 'median' | 'mean' | 'zero';
export type ImbalanceStrategy = 'smote' | 'undersample' | 'class_weight' | 'none';

export interface PreprocessingConfig {
  datasetId: string;
  selectedFeatures: string[];
  targetColumn: string;
  dropColumns: string[];
  scalingMethod: ScalingMethod;
  categoricalEncoding: CategoricalEncoding;
  imputationStrategy: ImputationStrategy;
  imbalanceHandling: ImbalanceStrategy;
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  randomSeed: number;
  stratify: boolean;
  removeZeroVariance: boolean;
  dropDuplicates: boolean;
}

export interface PreprocessingValidationSummary {
  isValid: boolean;
  totalFeaturesSelected: number;
  droppedCount: number;
  missingValuesToImpute: number;
  potentialDuplicates: number;
  classBalanceRatio: string;
  trainSamplesExpected: number;
  valSamplesExpected: number;
  testSamplesExpected: number;
  warnings: string[];
}

export interface PreprocessingJob {
  id: string;
  datasetId: string;
  datasetName: string;
  config: PreprocessingConfig;
  status: 'draft' | 'configured' | 'executing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  transformedDatasetRef?: string;
  trainRows?: number;
  valRows?: number;
  testRows?: number;
  retainedFeatureCount?: number;
  isBackendJob?: boolean;
}
