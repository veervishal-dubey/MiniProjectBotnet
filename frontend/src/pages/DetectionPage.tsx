import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  RefreshCw,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useActiveDataset } from '@/contexts/ActiveDatasetContext';
import { ActiveDatasetSelector } from '@/components/common/ActiveDatasetSelector';
import { downloadDatasetBlob } from '@/lib/datasetService';
import { NetworkFlowRecord, ProtocolType, RiskLevel } from '@/types/detection';
import { ModelItem } from '@/types/model';
import { apiClient } from '@/api/client';

const MODEL_CLASSES = [
  'Benign',
  'DDoS-ACK',
  'DDoS-SYN',
  'DDoS-TCP',
  'Mirai-greeth_flood',
  'Mirai-greip_flood',
  'Mirai-udpplain',
];

type SortField =
  | 'id'
  | 'timestamp'
  | 'srcIp'
  | 'dstIp'
  | 'protocol'
  | 'actualLabel'
  | 'predictedClass'
  | 'confidence'
  | 'riskLevel'
  | 'status';

export const DetectionPage: React.FC = () => {
  const { success, info, error } = useToast();
  const {
    activeDataset,
    activePredictions,
    setActivePredictions,
    classifyActiveDataset,
    isClassifyingActive,
  } = useActiveDataset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Models
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // Flow Predictions
  const [flows, setFlows] = useState<NetworkFlowRecord[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<NetworkFlowRecord | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  // Per-class stats from backend batch response
  const [batchClassStats, setBatchClassStats] = useState<Record<string, number>>({});
  const [batchClassPercentages, setBatchClassPercentages] = useState<Record<string, number>>({});
  const [failedFlowsCount, setFailedFlowsCount] = useState<number>(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [minConfidence, setMinConfidence] = useState<number>(0.0);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Single Flow Simulator Modal
  const [isSingleFlowModalOpen, setIsSingleFlowModalOpen] = useState(false);
  const [singleFlowModalTab, setSingleFlowModalTab] = useState<'socket' | 'vector'>('socket');

  // Socket simulation state
  const [simSrcIp, setSimSrcIp] = useState('192.168.1.180');
  const [simDstIp, setSimDstIp] = useState('198.51.100.44');
  const [simSrcPort, setSimSrcPort] = useState(48200);
  const [simDstPort, setSimDstPort] = useState(23); // Telnet / Mirai port
  const [simProtocol, setSimProtocol] = useState<ProtocolType>('TCP');
  const [simFlowDuration, setSimFlowDuration] = useState(120.4);
  const [simTotFwdPkts, setSimTotFwdPkts] = useState(480);
  const [simFlags, setSimFlags] = useState('SYN');

  // 39-feature raw vector simulation state
  const [rawFeatureJson, setRawFeatureJson] = useState<string>('{\n  "Flow Duration": 120.4,\n  "Tot Fwd Pkts": 480\n}');

  // Synchronize flows from activePredictions whenever activePredictions or activeDataset changes
  useEffect(() => {
    if (activePredictions && activePredictions.flows && activePredictions.flows.length > 0) {
      setFlows(activePredictions.flows);
      setBatchClassStats(activePredictions.per_class_counts || {});
      setBatchClassPercentages(activePredictions.per_class_percentages || {});
      setFailedFlowsCount(activePredictions.failed_count || 0);
      if (!selectedFlow && activePredictions.flows.length > 0) {
        setSelectedFlow(activePredictions.flows[0]);
      }
    } else if (!activeDataset) {
      setFlows([]);
      setBatchClassStats({});
      setBatchClassPercentages({});
      setFailedFlowsCount(0);
      setSelectedFlow(null);
    }
  }, [activePredictions, activeDataset]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const { data: md } = await apiClient.getModels();
        const nonDemo = md.filter(m => !m.isDemoSample);
        setModels(nonDemo);
        const queryModel = new URLSearchParams(window.location.search).get('model');
        if (queryModel && nonDemo.some(m => m.id === queryModel)) {
          setSelectedModelId(queryModel);
        } else if (nonDemo.length > 0 && !selectedModelId) {
          setSelectedModelId(nonDemo[0].id);
        }
      } catch (err) {
        setModels([]);
      }
    };
    loadModels();
  }, []);

  // Classify Active Dataset using full backend retrieval
  const handlePredictActiveDataset = async () => {
    if (!activeDataset) {
      error('No Active Dataset', 'Please select an active dataset using the dataset selector first.');
      return;
    }

    setIsClassifying(true);
    try {
      const res = await classifyActiveDataset(selectedModelId);
      setFlows(res.flows);
      setBatchClassStats(res.per_class_counts || {});
      setBatchClassPercentages(res.per_class_percentages || {});
      setFailedFlowsCount(res.failed_count || 0);
      setCurrentPage(1);

      if (res.flows.length > 0) {
        setSelectedFlow(res.flows[0]);
      }

      success(
        'Active Dataset Classified',
        `Analysed ${res.total_flows.toLocaleString()} flows from "${activeDataset.name}": ${res.malicious_count.toLocaleString()} malicious, ${res.benign_count.toLocaleString()} benign.`
      );
    } catch (err: any) {
      error('Dataset Inference Failed', err.message || 'Could not classify active dataset flows.');
    } finally {
      setIsClassifying(false);
    }
  };

  // Auto-classify active dataset on mount if no predictions exist yet
  useEffect(() => {
    if (
      activeDataset &&
      (!activePredictions || activePredictions.dataset_id !== activeDataset.id) &&
      !isClassifying &&
      !isClassifyingActive
    ) {
      handlePredictActiveDataset();
    }
  }, [activeDataset?.id]);

  // Upload external CSV batch
  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCsv(true);
    try {
      const res = await apiClient.predictCsv(file, selectedModelId);
      setFlows(res.flows);
      setActivePredictions(res);
      setBatchClassStats(res.per_class_counts || {});
      setBatchClassPercentages(res.per_class_percentages || {});
      setFailedFlowsCount(res.failed_count || 0);
      setCurrentPage(1);

      if (res.flows.length > 0) {
        setSelectedFlow(res.flows[0]);
      }
      success(
        'Batch Inference Complete',
        `Classified ${res.total_flows.toLocaleString()} flows: ${res.malicious_count.toLocaleString()} malicious attacks, ${res.benign_count.toLocaleString()} benign.`
      );
    } catch (err: any) {
      error('CSV Batch Prediction Failed', err.message || 'Could not parse and classify CSV.');
    } finally {
      setIsUploadingCsv(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Test single flow
  const handleSimulateSingleFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsClassifying(true);

    try {
      let payload: any = {};
      if (singleFlowModalTab === 'socket') {
        payload = {
          src_ip: simSrcIp,
          dst_ip: simDstIp,
          src_port: simSrcPort,
          dst_port: simDstPort,
          protocol: simProtocol,
          flow_duration_ms: simFlowDuration,
          tot_fwd_pkts: simTotFwdPkts,
          flags: simFlags,
        };
      } else {
        // Direct feature vector JSON
        let parsedFeatures: Record<string, number> = {};
        try {
          parsedFeatures = JSON.parse(rawFeatureJson);
        } catch {
          throw new Error('Invalid JSON format in 39-feature vector input.');
        }
        payload = {
          features: parsedFeatures,
          protocol: simProtocol,
          src_ip: simSrcIp,
          dst_ip: simDstIp,
        };
      }

      const newFlow = await apiClient.predictSingleFlow(payload);
      setFlows(prev => [newFlow, ...prev]);
      setSelectedFlow(newFlow);
      setIsSingleFlowModalOpen(false);

      if (newFlow.isMalicious) {
        success(
          'PyTorch Inference: Attack Detected',
          `Classified as ${newFlow.predictedClass} with ${(newFlow.confidence * 100).toFixed(1)}% confidence.`
        );
      } else {
        info(
          'PyTorch Inference: Normal Traffic',
          `Traffic pattern verified as ${newFlow.predictedClass} with ${(newFlow.confidence * 100).toFixed(1)}% confidence.`
        );
      }
    } catch (err: any) {
      error('Prediction Failed', err.message || 'Could not classify flow against PyTorch model.');
    } finally {
      setIsClassifying(false);
    }
  };

  // Export predictions as CSV
  const handleExportCsv = () => {
    if (flows.length === 0) {
      info('No Data to Export', 'Perform classification first to generate exportable predictions.');
      return;
    }

    const headers = [
      'Flow ID',
      'Timestamp',
      'Source IP',
      'Source Port',
      'Destination IP',
      'Destination Port',
      'Protocol',
      'Actual Label',
      'Predicted Class',
      'Is Malicious',
      'Confidence',
      'Risk Level',
      'Status',
      'Model Version',
    ];

    const rows = flows.map(f => [
      `"${f.flowId || f.id}"`,
      `"${f.timestamp}"`,
      `"${f.srcIp}"`,
      f.srcPort,
      `"${f.dstIp}"`,
      f.dstPort,
      `"${f.protocol}"`,
      `"${f.actualLabel || ''}"`,
      `"${f.predictedClass}"`,
      f.isMalicious ? 'TRUE' : 'FALSE',
      f.confidence.toFixed(4),
      `"${f.riskLevel}"`,
      `"${f.status || 'classified'}"`,
      `"${f.modelVersion}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinelfl_predictions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Export Complete', `Exported ${flows.length.toLocaleString()} predictions to CSV.`);
  };

  // Sorting handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Filtered and Sorted flows
  const filteredFlows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return flows.filter(flow => {
      // Search
      const matchSearch =
        !q ||
        (flow.flowId || flow.id).toLowerCase().includes(q) ||
        flow.srcIp.toLowerCase().includes(q) ||
        flow.dstIp.toLowerCase().includes(q) ||
        flow.predictedClass.toLowerCase().includes(q) ||
        (flow.actualLabel && flow.actualLabel.toLowerCase().includes(q)) ||
        String(flow.srcPort).includes(q) ||
        String(flow.dstPort).includes(q);

      // Class filter
      let matchClass = true;
      if (classFilter === 'malicious_only') matchClass = flow.isMalicious;
      else if (classFilter === 'benign_only') matchClass = !flow.isMalicious;
      else if (classFilter !== 'all') {
        matchClass = flow.predictedClass.toLowerCase() === classFilter.toLowerCase();
      }

      // Protocol filter
      const matchProto = protocolFilter === 'all' || flow.protocol === protocolFilter;

      // Risk filter
      const matchRisk = riskFilter === 'all' || flow.riskLevel === riskFilter;

      // Confidence filter
      const matchConf = flow.confidence >= minConfidence;

      return matchSearch && matchClass && matchProto && matchRisk && matchConf;
    });
  }, [flows, searchQuery, classFilter, protocolFilter, riskFilter, minConfidence]);

  const sortedFlows = useMemo(() => {
    return [...filteredFlows].sort((a, b) => {
      let valA: any = a[sortField as keyof NetworkFlowRecord];
      let valB: any = b[sortField as keyof NetworkFlowRecord];

      if (sortField === 'id') {
        valA = a.flowId || a.id;
        valB = b.flowId || b.id;
      }

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(String(valB));
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredFlows, sortField, sortDirection]);

  // Pagination calculation
  const totalRecords = sortedFlows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const currentPaginatedFlows = sortedFlows.slice(startIndex, endIndex);

  // Derive honest overall class counts
  const maliciousCount = flows.filter(f => f.isMalicious).length;
  const benignCount = flows.filter(f => !f.isMalicious).length;

  const perClassCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    MODEL_CLASSES.forEach(c => {
      counts[c] = 0;
    });
    flows.forEach(f => {
      const cls = f.predictedClass;
      if (counts[cls] !== undefined) {
        counts[cls] = (counts[cls] || 0) + 1;
      } else {
        counts[cls] = (counts[cls] || 0) + 1;
      }
    });
    return counts;
  }, [flows]);

  return (
    <div className="space-y-6">
      {/* Offline Notice Banner */}
      <DisclaimerBanner
        type="no-live-collector"
        message="Offline Batch Inference Mode. Real-time network intrusion monitoring requires genuine libpcap / Zeek sensor capture. Uploaded CSVs and workspace datasets are classified using the trained PyTorch MLP model."
      />

      {/* Persistent Global Active Dataset Selector */}
      <ActiveDatasetSelector />

      {/* Control Bar: Model Selector, Actions, Telemetry */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label
                htmlFor="model-select"
                className="block text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider mb-1 font-mono"
              >
                Inference Model Checkpoint
              </label>
              <select
                id="model-select"
                value={selectedModelId}
                onChange={e => setSelectedModelId(e.target.value)}
                className="text-xs font-semibold text-charcoal-900 bg-surface border border-border rounded px-3 py-1.5 focus:ring-1 focus:ring-forest-700 shadow-sm"
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
                Analysed Flows:
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant="forest" size="sm">
                  {benignCount.toLocaleString()} Benign
                </Badge>
                <Badge variant="red" size="sm">
                  {maliciousCount.toLocaleString()} Malicious
                </Badge>
                {failedFlowsCount > 0 && (
                  <Badge variant="neutral" size="sm">
                    {failedFlowsCount.toLocaleString()} Failed
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCsvFileChange}
              accept=".csv"
              className="hidden"
            />
            {activeDataset && (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                disabled={isClassifying || isUploadingCsv}
                isLoading={isClassifying}
                onClick={handlePredictActiveDataset}
                title={`Classify all ${activeDataset.rowCount.toLocaleString()} flows from active dataset "${activeDataset.name}"`}
              >
                Classify Active Dataset ({activeDataset.name})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Upload className="w-3.5 h-3.5" />}
              disabled={isUploadingCsv || isClassifying}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingCsv ? 'Classifying...' : 'Classify CSV Batch'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              disabled={flows.length === 0}
              onClick={handleExportCsv}
            >
              Export All CSV
            </Button>
            <Button
              size="sm"
              variant={activeDataset ? 'outline' : 'primary'}
              leftIcon={<Zap className="w-3.5 h-3.5" />}
              onClick={() => setIsSingleFlowModalOpen(true)}
            >
              Test Single Flow
            </Button>
          </div>
        </div>

        {/* Honest 7-Class Prediction Distribution Bar */}
        {flows.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border-subtle">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-charcoal-700 uppercase tracking-wider font-mono">
                Empirical Prediction Distribution ({flows.length.toLocaleString()} total flows)
              </span>
              <span className="text-[10px] text-charcoal-400 font-mono">
                Derived strictly from PyTorch inference output
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {MODEL_CLASSES.map(clsName => {
                const count = perClassCounts[clsName] || 0;
                const pct = flows.length > 0 ? ((count / flows.length) * 100).toFixed(1) : '0.0';
                const isBenign = clsName.toLowerCase() === 'benign';
                return (
                  <div
                    key={clsName}
                    className={`p-2 rounded border text-xs font-mono transition-all ${
                      count > 0
                        ? isBenign
                          ? 'bg-forest-50/50 border-forest-200 text-forest-900'
                          : 'bg-mutedRed-50/40 border-mutedRed-200 text-mutedRed-900'
                        : 'bg-surface-subtle border-border-subtle text-charcoal-400'
                    }`}
                  >
                    <div className="text-[10px] truncate font-sans font-semibold" title={clsName}>
                      {clsName}
                    </div>
                    <div className="text-sm font-bold mt-0.5">
                      {count.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-charcoal-500">
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter and Search Row */}
        <div className="mt-4 pt-3 border-t border-border-subtle grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-charcoal-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search Flow ID, IP, port, label..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded border border-border bg-surface pl-8 pr-2 py-1.5 text-xs text-charcoal-900 focus:ring-1 focus:ring-forest-700"
            />
          </div>

          <select
            value={classFilter}
            onChange={e => {
              setClassFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-charcoal-800 focus:ring-1 focus:ring-forest-700"
          >
            <option value="all">Class: All Categories</option>
            <option value="malicious_only">All Malicious Attacks</option>
            <option value="benign_only">Benign Traffic Only</option>
            {MODEL_CLASSES.map(c => (
              <option key={c} value={c}>
                Class: {c}
              </option>
            ))}
          </select>

          <select
            value={protocolFilter}
            onChange={e => {
              setProtocolFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-charcoal-800 focus:ring-1 focus:ring-forest-700"
          >
            <option value="all">Protocol: All</option>
            <option value="TCP">TCP Only</option>
            <option value="UDP">UDP Only</option>
            <option value="ICMP">ICMP Only</option>
            <option value="OTHER">Other Protocols</option>
          </select>

          <select
            value={riskFilter}
            onChange={e => {
              setRiskFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-charcoal-800 focus:ring-1 focus:ring-forest-700"
          >
            <option value="all">Risk: All Levels</option>
            <option value="low">Risk: Low</option>
            <option value="medium">Risk: Medium</option>
            <option value="high">Risk: High</option>
            <option value="critical">Risk: Critical</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-charcoal-500 font-mono whitespace-nowrap">
              Min Conf: {(minConfidence * 100).toFixed(0)}%
            </span>
            <input
              type="range"
              min="0.0"
              max="0.99"
              step="0.05"
              value={minConfidence}
              onChange={e => {
                setMinConfidence(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full accent-forest-800 cursor-pointer"
            />
          </div>
        </div>
      </Card>

      {/* Predictions Table */}
      {isClassifying || isClassifyingActive ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-forest-700" />
            <h3 className="font-semibold text-charcoal-900 text-sm">
              Classifying Active Dataset...
            </h3>
            <p className="text-xs text-charcoal-500 max-w-md">
              Running PyTorch FLMLP (39 → 128 → 64 → 32 → 7) across {activeDataset?.rowCount.toLocaleString() || 'all'} flows from &ldquo;{activeDataset?.name || 'dataset'}&rdquo;.
            </p>
          </div>
        </Card>
      ) : flows.length === 0 ? (
        <EmptyState
          title="No Flow Predictions Available"
          description={
            activeDataset
              ? `Active dataset "${activeDataset.name}" is loaded with ${activeDataset.rowCount.toLocaleString()} flows. Click "Classify Active Dataset" above to run genuine batch inference.`
              : 'Select an active dataset above or upload a CSV to run live PyTorch model inference.'
          }
          actionLabel={activeDataset ? `Classify Active Dataset (${activeDataset.name})` : 'Test Single Flow'}
          onAction={activeDataset ? handlePredictActiveDataset : () => setIsSingleFlowModalOpen(true)}
        />
      ) : filteredFlows.length === 0 ? (
        <EmptyState
          title="No Matching Predictions"
          description="No flows match your current search and filter criteria. Try broadening your filter parameters."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchQuery('');
            setClassFilter('all');
            setProtocolFilter('all');
            setRiskFilter('all');
            setMinConfidence(0.0);
          }}
        />
      ) : (
        <div className="space-y-3">
          {/* Table Header Controls: Count indicator and Page Size Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-xs">
            <div className="text-charcoal-600 font-mono">
              Showing <strong className="text-charcoal-900">{startIndex + 1}–{endIndex}</strong> of{' '}
              <strong className="text-charcoal-900">{filteredFlows.length.toLocaleString()}</strong> filtered predictions{' '}
              <span className="text-charcoal-400">({flows.length.toLocaleString()} total analysed)</span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="page-size-select" className="text-charcoal-500 font-sans">
                Rows per page:
              </label>
              <select
                id="page-size-select"
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs font-semibold text-charcoal-800 bg-surface border border-border rounded px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto border border-border rounded bg-surface shadow-subtle">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans select-none">
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('id')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Flow ID</span>
                      {sortField === 'id' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-charcoal-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('srcIp')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Source IP : Port</span>
                      {sortField === 'srcIp' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('dstIp')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Destination IP : Port</span>
                      {sortField === 'dstIp' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('protocol')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Proto</span>
                      {sortField === 'protocol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('actualLabel')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Actual Ground Truth</span>
                      {sortField === 'actualLabel' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('predictedClass')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Predicted Threat Class</span>
                      {sortField === 'predictedClass' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-charcoal-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('confidence')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Confidence</span>
                      {sortField === 'confidence' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-charcoal-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-charcoal-900"
                    onClick={() => handleSort('riskLevel')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Risk</span>
                      {sortField === 'riskLevel' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono">
                {currentPaginatedFlows.map(flow => (
                  <tr
                    key={flow.id}
                    onClick={() => setSelectedFlow(flow)}
                    className={`hover:bg-surface-subtle/70 cursor-pointer transition-colors ${
                      flow.isMalicious ? 'bg-mutedRed-50/20' : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      <div className="font-semibold text-charcoal-900 truncate max-w-[140px]" title={flow.flowId || flow.id}>
                        {flow.flowId || flow.id}
                      </div>
                      <span className="text-[10px] text-charcoal-400">
                        {new Date(flow.timestamp).toLocaleTimeString()}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-charcoal-800">
                      {flow.srcIp}:{flow.srcPort}
                    </td>
                    <td className="py-2 px-3 text-charcoal-800">
                      {flow.dstIp}:{flow.dstPort}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-charcoal-100 text-charcoal-700 text-[10px]">
                        {flow.protocol}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {flow.actualLabel ? (
                        <Badge
                          variant={flow.actualLabel.toLowerCase() === 'benign' ? 'forest' : 'neutral'}
                          size="sm"
                        >
                          {flow.actualLabel}
                        </Badge>
                      ) : (
                        <span className="text-charcoal-400 text-[11px] italic">Unlabelled</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {flow.status === 'rejected' ? (
                        <Badge variant="amber" size="sm">
                          REJECTED
                        </Badge>
                      ) : (
                        <Badge variant={flow.isMalicious ? 'red' : 'forest'} size="sm" dot>
                          {flow.predictedClass}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 px-3 font-semibold text-charcoal-900">
                      {(flow.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 font-sans">
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
                    <td className="py-2 px-3 text-right font-sans">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedFlow(flow);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Navigation Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 px-1 text-xs">
            <div className="text-charcoal-500 font-sans">
              Page <strong className="text-charcoal-900">{currentPage}</strong> of{' '}
              <strong className="text-charcoal-900">{totalPages}</strong>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(1)}
                title="First Page"
                className="px-2"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                title="Previous Page"
                className="px-2"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>

              <span className="px-3 font-mono text-charcoal-700">
                {currentPage} / {totalPages}
              </span>

              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                title="Next Page"
                className="px-2"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Last Page"
                className="px-2"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Flow Details Drawer */}
      <Drawer
        isOpen={!!selectedFlow}
        onClose={() => setSelectedFlow(null)}
        title={selectedFlow?.flowId || selectedFlow?.id || 'Flow Details'}
        subtitle={`Classified by: ${selectedFlow?.modelVersion || 'PyTorch FLMLP'}`}
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
              <div className="flex items-center gap-2">
                <Badge variant={selectedFlow.isMalicious ? 'red' : 'forest'} size="md">
                  {(selectedFlow.confidence * 100).toFixed(1)}% Confidence
                </Badge>
              </div>
            </div>

            {/* Actual Ground Truth vs Prediction Comparison */}
            {selectedFlow.actualLabel && (
              <div className="p-3.5 rounded bg-surface-subtle border border-border">
                <span className="text-[10px] text-charcoal-500 uppercase tracking-wider font-sans block mb-1">
                  Ground Truth Comparison
                </span>
                <div className="flex items-center justify-between font-sans">
                  <span>Actual Label: <strong>{selectedFlow.actualLabel}</strong></span>
                  <span>Predicted Class: <strong>{selectedFlow.predictedClass}</strong></span>
                  <Badge
                    variant={
                      selectedFlow.actualLabel.toLowerCase() === selectedFlow.predictedClass.toLowerCase()
                        ? 'forest'
                        : 'red'
                    }
                    size="sm"
                  >
                    {selectedFlow.actualLabel.toLowerCase() === selectedFlow.predictedClass.toLowerCase()
                      ? 'Correct'
                      : 'Misclassified'}
                  </Badge>
                </div>
              </div>
            )}

            {/* Socket Identifiers */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                Network Socket Endpoints
              </h4>
              <div className="p-3 rounded bg-surface-subtle border border-border font-mono space-y-1.5">
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Source Endpoint:</span>
                  <span className="font-semibold text-charcoal-900">
                    {selectedFlow.srcIp}:{selectedFlow.srcPort}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Destination Endpoint:</span>
                  <span className="font-semibold text-charcoal-900">
                    {selectedFlow.dstIp}:{selectedFlow.dstPort}
                  </span>
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
          </div>
        )}
      </Drawer>

      {/* Test Single Flow Modal */}
      <Modal
        isOpen={isSingleFlowModalOpen}
        onClose={() => setIsSingleFlowModalOpen(false)}
        title="Simulate Single Network Flow Record"
        description="Provide packet statistics to test classification against the active PyTorch MLP model checkpoint."
        maxWidth="md"
      >
        <div className="mb-4">
          <Tabs
            tabs={[
              { id: 'socket', label: 'Network Socket Form' },
              { id: 'vector', label: '39-Feature Raw Vector' },
            ]}
            activeTab={singleFlowModalTab}
            onChange={t => setSingleFlowModalTab(t as any)}
          />
        </div>

        <form onSubmit={handleSimulateSingleFlow} className="space-y-4">
          {singleFlowModalTab === 'socket' ? (
            <>
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
            </>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-charcoal-700">
                JSON Feature Dictionary (39 Features)
              </label>
              <textarea
                value={rawFeatureJson}
                onChange={e => setRawFeatureJson(e.target.value)}
                rows={8}
                className="w-full rounded border border-border bg-surface p-2 text-xs font-mono text-charcoal-900 focus:ring-1 focus:ring-forest-700"
                placeholder='{ "Flow Duration": 120.4, "Tot Fwd Pkts": 480, ... }'
              />
              <p className="text-[11px] text-charcoal-500">
                Any features not specified in the dictionary will be defaulted to 0.0 before applying RobustScaler transformation.
              </p>
            </div>
          )}

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
