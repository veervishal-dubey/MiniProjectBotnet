export type ProtocolType = 'TCP' | 'UDP' | 'ICMP' | 'OTHER';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface NetworkFlowRecord {
  id: string;
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
  isMalicious: boolean;
  confidence: number;
  riskLevel: RiskLevel;
  modelVersion: string;
  isSyntheticSample?: boolean;
}

export interface DetectionFilter {
  searchQuery: string;
  classFilter: string; // 'all' | 'malicious_only' | 'benign_only' | specific class
  protocolFilter: string;
  minConfidence: number;
  riskFilter: string;
}
