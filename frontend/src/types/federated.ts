export type ClientType = 'smart_home' | 'industrial' | 'campus';
export type PartitionStrategy = 'iid' | 'non_iid_dirichlet' | 'non_iid_device';

export interface FLClient {
  id: string;
  name: string;
  clientType: ClientType;
  deviceTypes: string[];
  simulatedEnvironment: string;
  sampleCount: number;
  dataDistribution: 'non_iid' | 'iid';
  status: 'idle' | 'training' | 'uploading' | 'synced' | 'offline';
  localEpochs: number;
  sampleWeight: number; // n_k / N
  localLoss?: number;
  localAccuracy?: number;
  localF1?: number;
  dominantAttackClass?: string;
  trafficVolumeMbps?: number;
}

export interface ClientRoundMetric {
  clientId: string;
  clientName: string;
  localLoss: number;
  localAccuracy: number;
  localF1: number;
  sampleWeight: number;
  samplesUsed: number;
}

export interface FLRoundSummary {
  round: number;
  globalLoss: number;
  globalAccuracy: number;
  globalF1: number;
  activeClientsCount: number;
  durationSeconds: number;
  clientMetrics: ClientRoundMetric[];
  aggregatedAt: string;
}

export interface FLExperiment {
  id: string;
  name: string;
  description: string;
  datasetName: string;
  roundsTotal: number;
  currentRound: number;
  status: 'idle' | 'running' | 'completed' | 'paused';
  partitionStrategy: PartitionStrategy;
  dirichletAlpha?: number;
  clientParticipationFraction: number;
  learningRate: number;
  batchSize: number;
  randomSeed: number;
  clients: FLClient[];
  roundsHistory: FLRoundSummary[];
  globalModelVersion: string;
  baselineCentralizedF1?: number;
  createdAt: string;
  isDemonstrationRun?: boolean;
}
