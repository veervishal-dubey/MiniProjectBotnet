export interface ResearchDefaults {
  randomSeed: number;
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  defaultClients: number;
  defaultRounds: number;
  defaultLocalEpochs: number;
  defaultDirichletAlpha: number;
  defaultBatchSize: number;
  defaultLearningRate: number;
  imbalanceHandling: 'smote' | 'undersample' | 'class_weight' | 'none';
}

export interface PlatformSettings {
  researchDefaults: ResearchDefaults;
  backendApiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  useDemoData: boolean;
  themePreference: 'light-stone' | 'system';
  anonymousAnalytics: boolean;
  saveLocalCache: boolean;
}

export interface BackendStatus {
  connected: boolean;
  service: string;
  version?: string;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
}
