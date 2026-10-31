export type ProtocolType = 'TCP' | 'UDP' | 'ICMP' | 'OTHER';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface NetworkFlowRecord {
  id: string;
  flowId?: string;
  timestamp: string;
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  protocol: ProtocolType;
  flowDurationMs: number;
  totFwdPkts: number;
  totBwdPkts: number;
  pktLenMean: number;
  flowBytsPerSec: number;
  flags: string;
  predictedClass: string;
  actualLabel?: string;
  status?: 'classified' | 'failed' | 'pending' | 'rejected';
  isMalicious: boolean;
  confidence: number;
  riskLevel: RiskLevel;
  modelVersion: string;
  isSyntheticSample?: boolean;
}

export interface BatchClassificationResult {
  total_flows: number;
  malicious_count: number;
  benign_count: number;
  failed_count: number;
  flows: NetworkFlowRecord[];
  model_version: string;
  model_id?: string;
  dataset_id?: string;
  dataset_name?: string;
  per_class_counts: Record<string, number>;
  per_class_percentages: Record<string, number>;
  evaluation?: any;
}

export interface DetectionFilter {
  searchQuery: string;
  classFilter: string; // 'all' | 'malicious_only' | 'benign_only' | specific class
  protocolFilter: string;
  minConfidence: number;
  riskFilter: string;
}

