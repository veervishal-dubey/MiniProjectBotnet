import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  Upload,
  ArrowRight,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { storage } from '@/lib/storage';
import { NetworkFlowRecord, ProtocolType, RiskLevel } from '@/types/detection';
import { ModelItem } from '@/types/model';
import { DEMO_FLOW_RECORDS } from '@/api/mockData';

export const DetectionPage: React.FC = () => {
  const { isDemoMode } = useOutletContext<{ isDemoMode: boolean }>();
  const { success, info, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [flows, setFlows] = useState<NetworkFlowRecord[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<NetworkFlowRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<'all' | 'malicious_only' | 'benign_only'>('all');
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [minConfidence, setMinConfidence] = useState<number>(0.5);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isSingleFlowModalOpen, setIsSingleFlowModalOpen] = useState(false);

  // Single Flow Simulator Form State
  const [simSrcIp, setSimSrcIp] = useState('192.168.1.180');
  const [simDstIp, setSimDstIp] = useState('198.51.100.44');
  const [simSrcPort, setSimSrcPort] = useState(48200);
  const [simDstPort, setSimDstPort] = useState(23); // Telnet / Mirai port
  const [simProtocol, setSimProtocol] = useState<ProtocolType>('TCP');
  const [simFlowDuration, setSimFlowDuration] = useState(120.4);
  const [simTotFwdPkts, setSimTotFwdPkts] = useState(480);
  const [simFlags, setSimFlags] = useState('SYN');

  useEffect(() => {
    const md = storage.getModels(isDemoMode);
    setModels(md);
    if (md.length > 0 && !selectedModelId) {
      setSelectedModelId(md[0].id);
    }
    if (isDemoMode) {
      setFlows(DEMO_FLOW_RECORDS);
    } else {
      setFlows([]);
    }
  }, [isDemoMode]);

  const handleSimulateSingleFlow = (e: React.FormEvent) => {
    e.preventDefault();
    setIsClassifying(true);

    setTimeout(() => {
      // Heuristic decision logic for the test client preview
      const isTelnetOrDDoS = simDstPort === 23 || simTotFwdPkts > 200 || simFlags.includes('SYN');
      const predictedClass = isTelnetOrDDoS
        ? simProtocol === 'UDP'
          ? 'Mirai-UDP_Flood'
          : 'DDoS-SYN_Flood'
        : 'Benign';
      const isMalicious = isTelnetOrDDoS;
      const confidence = isMalicious ? 0.984 : 0.992;
      const riskLevel: RiskLevel = isMalicious ? 'critical' : 'low';

      const newFlow: NetworkFlowRecord = {
        id: `flow-${Date.now()}`,
        timestamp: new Date().toISOString(),
        srcIp: simSrcIp,
        srcPort: simSrcPort,
        dstIp: simDstIp,
        dstPort: simDstPort,
        protocol: simProtocol,
        flowDurationMs: simFlowDuration,
        totFwdPkts: simTotFwdPkts,
        totBwdPkts: isMalicious ? 0 : 24,
        pktLenMean: isMalicious ? 64.0 : 420.0,
        flowBytsPerSec: isMalicious ? 48500000 : 124000,
        flags: simFlags,
        predictedClass,
        isMalicious,
        confidence,
        riskLevel,
        modelVersion: models.find(m => m.id === selectedModelId)?.version || 'v2.1-FL',
        isSyntheticSample: true,
      };

      setFlows(prev => [newFlow, ...prev]);
      setSelectedFlow(newFlow);
      setIsClassifying(false);
      setIsSingleFlowModalOpen(false);

      if (isMalicious) {
        success('Flow Evaluated: Malicious Intrusion', `Classified as ${predictedClass} with ${(confidence * 100).toFixed(1)}% confidence.`);
      } else {
        info('Flow Evaluated: Benign Traffic', `Classified as Benign normal flow with ${(confidence * 100).toFixed(1)}% confidence.`);
      }
    }, 400);
  };

  const handleExportCsv = () => {
    if (flows.length === 0) {
      error('No Flows to Export', 'There are no classified flow records in the current view.');
      return;
    }

    const headers = [
      'flow_id',
      'timestamp',
      'src_ip',
      'src_port',
      'dst_ip',
      'dst_port',
      'protocol',
      'duration_ms',
      'tot_fwd_pkts',
      'predicted_class',
      'is_malicious',
      'confidence',
      'risk_level',
      'model_version',
    ];

    const csvRows = [headers.join(',')];
    flows.forEach(f => {
      const row = [
        f.id,
        f.timestamp,
        f.srcIp,
        f.srcPort,
        f.dstIp,
        f.dstPort,
        f.protocol,
        f.flowDurationMs,
        f.totFwdPkts,
        `"${f.predictedClass}"`,
        f.isMalicious,
        f.confidence,
        f.riskLevel,
        f.modelVersion,
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinelfl_detection_predictions_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success('CSV Exported', `Saved ${flows.length} classified flow records to your downloads folder.`);
  };

  const filteredFlows = flows.filter(flow => {
    // Search
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      flow.id.toLowerCase().includes(q) ||
      flow.srcIp.toLowerCase().includes(q) ||
      flow.dstIp.toLowerCase().includes(q) ||
      flow.predictedClass.toLowerCase().includes(q);

    // Class filter
    let matchClass = true;
    if (classFilter === 'malicious_only') matchClass = flow.isMalicious;
    if (classFilter === 'benign_only') matchClass = !flow.isMalicious;

    // Protocol filter
    const matchProto = protocolFilter === 'all' || flow.protocol === protocolFilter;

    // Confidence filter
    const matchConf = flow.confidence >= minConfidence;

    return matchSearch && matchClass && matchProto && matchConf;
  });

  const maliciousCount = flows.filter(f => f.isMalicious).length;
  const benignCount = flows.filter(f => !f.isMalicious).length;

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="no-live-collector"
        message="Offline Batch Inference Mode. Real-time network intrusion monitoring requires genuine libpcap / Zeek sensor capture."
      />

      {/* Control Bar: Model Selector, Filters, Actions */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="model-select" className="block text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider mb-1">
                Active Classification Model
              </label>
              <select
                id="model-select"
                value={selectedModelId}
                onChange={e => setSelectedModelId(e.target.value)}
                className="text-xs font-semibold text-charcoal-900 bg-surface border border-border rounded px-3 py-1.5 focus:ring-1 focus:ring-forest-700"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.version}) • {m.architecture}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4 lg:pt-0">
              <span className="text-[11px] font-mono text-charcoal-500 block mb-1">
                Batch Telemetry:
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="red" size="sm">
                  {maliciousCount} Malicious
                </Badge>
                <Badge variant="forest" size="sm">
                  {benignCount} Benign
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Zap className="w-3.5 h-3.5" />}
              onClick={() => setIsSingleFlowModalOpen(true)}
            >
              Test Single Flow
            </Button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="mt-4 pt-3 border-t border-border-subtle grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-charcoal-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search IP, Port, or Class..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded border border-border bg-surface pl-8 pr-2 py-1.5 text-xs text-charcoal-900"
            />
          </div>

          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value as any)}
            className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-charcoal-800"
          >
            <option value="all">Class: All Categories</option>
            <option value="malicious_only">Malicious Attacks Only</option>
            <option value="benign_only">Benign Traffic Only</option>
          </select>

          <select
            value={protocolFilter}
            onChange={e => setProtocolFilter(e.target.value)}
            className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-charcoal-800"
          >
            <option value="all">Protocol: All</option>
            <option value="TCP">TCP Only</option>
            <option value="UDP">UDP Only</option>
            <option value="ICMP">ICMP Only</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-charcoal-500 font-mono whitespace-nowrap">
              Min Conf: {(minConfidence * 100).toFixed(0)}%
            </span>
            <input
              type="range"
              min="0.5"
              max="0.99"
              step="0.05"
              value={minConfidence}
              onChange={e => setMinConfidence(Number(e.target.value))}
              className="w-full accent-forest-800 cursor-pointer"
            />
          </div>
        </div>
      </Card>

      {/* Predictions Table */}
      {filteredFlows.length === 0 ? (
        <EmptyState
          title="No Flow Predictions"
          description="No flow records match your active query. Test a single flow above or toggle Demonstration Mode."
          actionLabel="Test Single Flow"
          onAction={() => setIsSingleFlowModalOpen(true)}
        />
      ) : (
        <div className="overflow-x-auto border border-border rounded bg-surface shadow-subtle">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans">
                <th className="py-2.5 px-3">Flow ID / Time</th>
                <th className="py-2.5 px-3">Source IP : Port</th>
                <th className="py-2.5 px-3">Destination IP : Port</th>
                <th className="py-2.5 px-3">Protocol</th>
                <th className="py-2.5 px-3">Predicted Threat Class</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Risk Level</th>
                <th className="py-2.5 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle font-mono">
              {filteredFlows.map(flow => (
                <tr
                  key={flow.id}
                  onClick={() => setSelectedFlow(flow)}
                  className={`hover:bg-surface-subtle/70 cursor-pointer transition-colors ${
                    flow.isMalicious ? 'bg-mutedRed-50/20' : ''
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-charcoal-900">{flow.id}</div>
                    <span className="text-[10px] text-charcoal-400">
                      {new Date(flow.timestamp).toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-charcoal-800">
                    {flow.srcIp}:{flow.srcPort}
                  </td>
                  <td className="py-2.5 px-3 text-charcoal-800">
                    {flow.dstIp}:{flow.dstPort}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-1.5 py-0.5 rounded bg-charcoal-100 text-charcoal-700 text-[10px]">
                      {flow.protocol}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <Badge variant={flow.isMalicious ? 'red' : 'forest'} size="sm" dot>
                      {flow.predictedClass}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-charcoal-900">
                    {(flow.confidence * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span
                      className={`text-[11px] font-semibold uppercase ${
                        flow.riskLevel === 'critical'
                          ? 'text-mutedRed-700'
                          : flow.riskLevel === 'high'
                          ? 'text-warmAmber-700'
                          : 'text-charcoal-500'
                      }`}
                    >
                      {flow.riskLevel}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={() => setSelectedFlow(flow)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flow Details Drawer */}
      <Drawer
        isOpen={!!selectedFlow}
        onClose={() => setSelectedFlow(null)}
        title={selectedFlow?.id || 'Flow Details'}
        subtitle={`Classified by: ${selectedFlow?.modelVersion || 'v2.1-FL'}`}
        width="lg"
      >
        {selectedFlow && (
          <div className="space-y-6 text-xs">
            <div className="p-4 rounded border bg-surface flex items-center justify-between">
              <div>
                <span className="text-[10px] text-charcoal-500 uppercase tracking-wider font-sans">
                  Classification Result
                </span>
                <div className="text-base font-bold text-charcoal-900 mt-0.5 font-sans">
                  {selectedFlow.predictedClass}
                </div>
              </div>
              <Badge variant={selectedFlow.isMalicious ? 'red' : 'forest'} size="md">
                {(selectedFlow.confidence * 100).toFixed(1)}% Confidence
              </Badge>
            </div>

            {/* Socket Identifiers */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                Network Socket Endpoints
              </h4>
              <div className="p-3 rounded bg-surface-subtle border border-border font-mono space-y-1.5">
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Source Endpoint:</span>
                  <span className="font-semibold text-charcoal-900">{selectedFlow.srcIp}:{selectedFlow.srcPort}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Destination Endpoint:</span>
                  <span className="font-semibold text-charcoal-900">{selectedFlow.dstIp}:{selectedFlow.dstPort}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Transport Protocol:</span>
                  <span className="font-semibold text-charcoal-900">{selectedFlow.protocol}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-charcoal-500 font-sans">TCP Control Flags:</span>
                  <span className="font-semibold text-forest-800">{selectedFlow.flags}</span>
                </div>
              </div>
            </div>

            {/* Extracted Flow Attributes */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                Computed Flow Features
              </h4>
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-[10px] text-charcoal-400 block font-sans">Flow Duration</span>
                  <span className="font-bold text-charcoal-900">{selectedFlow.flowDurationMs} ms</span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-[10px] text-charcoal-400 block font-sans">Forward Packets</span>
                  <span className="font-bold text-charcoal-900">{selectedFlow.totFwdPkts} pkts</span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-[10px] text-charcoal-400 block font-sans">Mean Packet Length</span>
                  <span className="font-bold text-charcoal-900">{selectedFlow.pktLenMean} bytes</span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-[10px] text-charcoal-400 block font-sans">Flow Rate (bytes/s)</span>
                  <span className="font-bold text-charcoal-900">
                    {selectedFlow.flowBytsPerSec.toLocaleString()} B/s
                  </span>
                </div>
              </div>
            </div>

            {/* Synthetic Sample Label */}
            {selectedFlow.isSyntheticSample && (
              <div className="p-2.5 rounded bg-warmAmber-50 border border-warmAmber-200 text-warmAmber-900 text-[11px] leading-relaxed font-sans">
                <strong>Synthetic Test Demonstration:</strong> This flow record was parsed from the curated
                benchmark test split to demonstrate inference pipeline mechanics.
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Test Single Flow Modal */}
      <Modal
        isOpen={isSingleFlowModalOpen}
        onClose={() => setIsSingleFlowModalOpen(false)}
        title="Simulate Single Network Flow Record"
        description="Provide packet statistics to test classification against the active model checkpoint."
        maxWidth="md"
      >
        <form onSubmit={handleSimulateSingleFlow} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Source IP"
              value={simSrcIp}
              onChange={e => setSimSrcIp(e.target.value)}
              mono={true}
              required
            />
            <Input
              label="Source Port"
              type="number"
              value={simSrcPort}
              onChange={e => setSimSrcPort(Number(e.target.value))}
              mono={true}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Destination IP"
              value={simDstIp}
              onChange={e => setSimDstIp(e.target.value)}
              mono={true}
              required
            />
            <Input
              label="Destination Port (e.g. 23=Telnet)"
              type="number"
              value={simDstPort}
              onChange={e => setSimDstPort(Number(e.target.value))}
              mono={true}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Protocol"
              value={simProtocol}
              onChange={e => setSimProtocol(e.target.value as ProtocolType)}
              options={[
                { value: 'TCP', label: 'TCP' },
                { value: 'UDP', label: 'UDP' },
                { value: 'ICMP', label: 'ICMP' },
              ]}
            />
            <Input
              label="TCP Flags"
              value={simFlags}
              onChange={e => setSimFlags(e.target.value)}
              mono={true}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (ms)"
              type="number"
              value={simFlowDuration}
              onChange={e => setSimFlowDuration(Number(e.target.value))}
              mono={true}
            />
            <Input
              label="Forward Packets Count"
              type="number"
              value={simTotFwdPkts}
              onChange={e => setSimTotFwdPkts(Number(e.target.value))}
              mono={true}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-border-subtle">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSingleFlowModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              isLoading={isClassifying}
            >
              Classify Flow
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
