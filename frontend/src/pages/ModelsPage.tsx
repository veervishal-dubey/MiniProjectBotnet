import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Cpu,
  Layers,
  FileCheck,
  Plus,
  Play,
  RotateCcw,
  CheckCircle2,
  BarChart,
  HardDrive,
  Info,
  Clock,
  Zap,
  RefreshCw,
  AlertCircle,
  Database,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { fetchWorkspaceDatasets } from '@/lib/datasetService';
import {
  fetchWorkspaceModelRuns,
  mapDatabaseRowToModel,
} from '@/lib/modelService';
import { DEMO_MODELS } from '@/api/mockData';
import { ModelItem, ModelArchitecture, ModelParadigm } from '@/types/model';
import { Dataset } from '@/types/dataset';

export const ModelsPage: React.FC = () => {
  const { isDemoMode } = useOutletContext<{ isDemoMode: boolean }>();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { info } = useToast();

  const [models, setModels] = useState<ModelItem[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(null);
  const [filterParadigm, setFilterParadigm] = useState<'all' | ModelParadigm | 'live' | 'demo'>('all');
  const [isTrainModalOpen, setIsTrainModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch real workspace datasets for context if workspace exists
      if (workspace?.id) {
        try {
          const wsDatasets = await fetchWorkspaceDatasets(workspace.id);
          setDatasets(wsDatasets);
        } catch (dsErr) {
          console.warn('Could not load workspace datasets:', dsErr);
        }
      } else {
        setDatasets([]);
      }

      // 2. Fetch live model runs from public.model_runs strictly filtered by workspace
      let liveRuns: ModelItem[] = [];
      if (workspace?.id) {
        try {
          liveRuns = await fetchWorkspaceModelRuns(workspace.id);
        } catch (runErr: any) {
          console.warn('Error fetching live model runs:', runErr);
          setErrorMsg(runErr.message || 'Failed to query public.model_runs from Supabase.');
        }
      }

      // 3. Assemble model list based on Demo Mode setting
      if (isDemoMode) {
        // In Demo Mode, display both genuine runs and benchmark reference baselines
        setModels([...liveRuns, ...DEMO_MODELS]);
      } else {
        // In production/workspace mode, display exclusively verified persisted records
        setModels(liveRuns);
      }
    } catch (err: any) {
      console.error('Failed to load model registry:', err);
      setErrorMsg(err.message || 'An unexpected error occurred while loading the model registry.');
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode, workspace?.id]);

  useEffect(() => {
    loadData();
    window.addEventListener('sentinelfl:demomode-change', loadData);
    return () => window.removeEventListener('sentinelfl:demomode-change', loadData);
  }, [loadData]);

  const filteredModels = models.filter(m => {
    if (filterParadigm === 'all') return true;
    if (filterParadigm === 'live') return !m.isDemoSample;
    if (filterParadigm === 'demo') return m.isDemoSample;
    return m.paradigm === filterParadigm;
  });

  const liveRunsCount = models.filter(m => !m.isDemoSample).length;
  const demoRunsCount = models.filter(m => m.isDemoSample).length;

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type={isDemoMode ? 'demo' : undefined}
        message={
          isDemoMode
            ? 'Demo Mode Active: Displaying synthetic benchmark models alongside any live runs. Turn off Demo Mode to view exclusively verified database records from public.model_runs.'
            : 'Live Model Registry: Connected to Supabase public.model_runs. Centralized ML and Federated Learning algorithms are developed independently by teammate per the ML/FL contract.'
        }
      />

      {/* Error state banner */}
      {errorMsg && (
        <div className="p-4 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-subtle">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Model Registry Notice</p>
              <p className="text-amber-800 mt-0.5">{errorMsg}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs border-amber-300 hover:bg-amber-100"
            onClick={loadData}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={filterParadigm === 'all' ? 'primary' : 'outline'}
            onClick={() => setFilterParadigm('all')}
          >
            All Models ({models.length})
          </Button>
          <Button
            size="sm"
            variant={filterParadigm === 'centralized' ? 'primary' : 'outline'}
            onClick={() => setFilterParadigm('centralized')}
          >
            Centralized Baselines
          </Button>
          <Button
            size="sm"
            variant={filterParadigm === 'federated_global' ? 'primary' : 'outline'}
            onClick={() => setFilterParadigm('federated_global')}
          >
            Federated Global
          </Button>
          {isDemoMode && (
            <Button
              size="sm"
              variant={filterParadigm === 'live' ? 'primary' : 'outline'}
              onClick={() => setFilterParadigm('live')}
            >
              Live Runs ({liveRunsCount})
            </Button>
          )}
          {isDemoMode && (
            <Button
              size="sm"
              variant={filterParadigm === 'demo' ? 'primary' : 'outline'}
              onClick={() => setFilterParadigm('demo')}
            >
              Benchmark Demos ({demoRunsCount})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            title="Refresh model runs from Supabase"
          >
            Refresh
          </Button>

          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsTrainModalOpen(true)}
          >
            Stage Baseline Training
          </Button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <Card className="p-8 text-center text-charcoal-500">
          <div className="inline-flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-forest-700" />
            <span className="text-sm font-medium">Loading model runs from public.model_runs...</span>
          </div>
        </Card>
      ) : filteredModels.length === 0 ? (
        <EmptyState
          title="No Model Runs Yet"
          description="No centralized or federated training runs have been recorded for this workspace. Once training is completed and genuine results are saved, they will appear here."
          actionLabel="Stage Baseline Training"
          onAction={() => setIsTrainModalOpen(true)}
        />
      ) : (
        <div className="w-full border border-border rounded-lg bg-surface shadow-subtle overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[760px] text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans">
                  <th className="py-2.5 px-3 min-w-[180px] max-w-[240px]">Model</th>
                  <th className="py-2.5 px-3 min-w-[120px] whitespace-nowrap">Type</th>
                  <th className="py-2.5 px-3 min-w-[150px] max-w-[220px]">Dataset</th>
                  <th className="py-2.5 px-3 min-w-[85px] whitespace-nowrap">Accuracy</th>
                  <th className="py-2.5 px-3 min-w-[85px] whitespace-nowrap">F1 Score</th>
                  <th className="py-2.5 px-3 min-w-[85px] whitespace-nowrap">Latency</th>
                  <th className="py-2.5 px-3 min-w-[105px] whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 min-w-[80px] text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono">
                {filteredModels.map(model => {
                  const hasAcc = typeof model.metrics?.accuracy === 'number';
                  const f1Val = typeof model.metrics?.f1_score === 'number'
                    ? model.metrics.f1_score
                    : typeof model.metrics?.f1Score === 'number'
                    ? model.metrics.f1Score
                    : undefined;
                  const hasF1 = typeof f1Val === 'number';
                  const latVal = typeof model.metrics?.inference_latency_ms === 'number'
                    ? model.metrics.inference_latency_ms
                    : typeof model.metrics?.inferenceLatencyMs === 'number'
                    ? model.metrics.inferenceLatencyMs
                    : undefined;
                  const hasLat = typeof latVal === 'number';

                  // Status badge variant
                  let statusVariant: 'forest' | 'amber' | 'neutral' | 'red' | 'sage' = 'neutral';
                  let statusLabel = (model.rawStatus || model.status).toUpperCase();
                  if (model.status === 'trained') {
                    statusVariant = 'forest';
                    statusLabel = 'COMPLETED';
                  } else if (model.status === 'training') {
                    statusVariant = 'amber';
                    statusLabel = 'RUNNING';
                  } else if (model.status === 'staged') {
                    statusVariant = 'sage';
                    statusLabel = 'STAGED';
                  } else if (model.status === 'failed') {
                    statusVariant = 'red';
                    statusLabel = 'FAILED';
                  } else if (model.status === 'archived') {
                    statusVariant = 'neutral';
                    statusLabel = 'ARCHIVED';
                  }

                  return (
                    <tr
                      key={model.id}
                      onClick={() => setSelectedModel(model)}
                      className="hover:bg-surface-subtle/70 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 font-sans min-w-[180px] max-w-[240px]">
                        <span
                          className="font-semibold text-charcoal-900 truncate block"
                          title={model.name}
                        >
                          {model.name}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans min-w-[120px] whitespace-nowrap">
                        <Badge
                          variant={model.paradigm === 'federated_global' ? 'forest' : 'neutral'}
                          size="sm"
                        >
                          {model.paradigm === 'federated_global' ? 'Federated Global' : 'Centralized'}
                        </Badge>
                        {model.isDemoSample && (
                          <Badge variant="demo" size="sm" className="ml-1.5">
                            Demo
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 font-sans text-charcoal-700 min-w-[150px] max-w-[220px]">
                        <span
                          className="truncate block"
                          title={model.datasetUsed || 'Unassigned Dataset'}
                        >
                          {model.datasetUsed || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 min-w-[85px] whitespace-nowrap text-charcoal-800">
                        {hasAcc ? `${(model.metrics.accuracy! * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-3 px-3 min-w-[85px] whitespace-nowrap">
                        {hasF1 ? (
                          <span className="font-semibold text-forest-800">
                            {(f1Val! * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-charcoal-400 font-normal">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 min-w-[85px] whitespace-nowrap text-charcoal-700">
                        {hasLat ? `${latVal} ms` : '—'}
                      </td>
                      <td className="py-3 px-3 font-sans min-w-[105px] whitespace-nowrap">
                        <Badge variant={statusVariant} size="sm" dot>
                          {statusLabel}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right font-sans min-w-[80px] whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedModel(model);
                          }}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model Detail Drawer */}
      <Drawer
        isOpen={!!selectedModel}
        onClose={() => setSelectedModel(null)}
        title={selectedModel?.name || 'Model Details'}
        subtitle={
          selectedModel?.isDemoSample
            ? 'Reference Baseline (Demo Mode Sample)'
            : `Persisted Run ID: ${selectedModel?.id || ''}`
        }
        width="lg"
      >
        {selectedModel && (
          <div className="space-y-6 text-xs">
            {/* Model Identity & Record Source */}
            <div className="p-3.5 rounded-lg bg-surface-subtle border border-border space-y-2 font-sans">
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500 font-medium">Record Source:</span>
                {selectedModel.isDemoSample ? (
                  <Badge variant="demo" size="sm">Static Benchmark Demo</Badge>
                ) : (
                  <Badge variant="forest" size="sm">Supabase public.model_runs</Badge>
                )}
              </div>
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Run Identifier:</span>
                <span className="text-charcoal-900 truncate max-w-[240px] font-semibold" title={selectedModel.id}>
                  {selectedModel.id || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Architecture:</span>
                <span className="text-charcoal-900 font-semibold">{selectedModel.architecture || '—'}</span>
              </div>
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Model Version:</span>
                <span className="text-charcoal-900 font-semibold">{selectedModel.version || '—'}</span>
              </div>
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Paradigm:</span>
                <span className="text-charcoal-900 font-semibold">
                  {selectedModel.paradigm === 'federated_global' ? 'Federated Global' : 'Centralized Baseline'}
                </span>
              </div>
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Dataset Source:</span>
                <span className="text-charcoal-900 truncate max-w-[240px]" title={selectedModel.datasetUsed}>
                  {selectedModel.datasetUsed || '—'}
                </span>
              </div>
              {selectedModel.datasetId && (
                <div className="flex justify-between items-center font-mono text-[11px]">
                  <span className="text-charcoal-500">Dataset ID:</span>
                  <span className="text-charcoal-900 truncate max-w-[240px]">{selectedModel.datasetId}</span>
                </div>
              )}
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Created:</span>
                <span className="text-charcoal-900">
                  {selectedModel.trainingDate ? new Date(selectedModel.trainingDate).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center font-mono text-[11px]">
                <span className="text-charcoal-500">Training Duration:</span>
                <span className="text-charcoal-900 font-semibold">
                  {typeof (selectedModel.metrics?.training_time_sec ?? selectedModel.metrics?.trainingTimeSec) === 'number'
                    ? `${Number(selectedModel.metrics?.training_time_sec ?? selectedModel.metrics?.trainingTimeSec).toFixed(1)} seconds`
                    : '—'}
                </span>
              </div>
              {selectedModel.createdBy && (
                <div className="flex justify-between items-center font-mono text-[11px]">
                  <span className="text-charcoal-500">Initiated By (User ID):</span>
                  <span className="text-charcoal-900 truncate max-w-[200px]">{selectedModel.createdBy}</span>
                </div>
              )}
            </div>

            {/* Error message banner if run failed */}
            {selectedModel.metrics?.error && (
              <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 text-xs space-y-1">
                <span className="font-semibold flex items-center gap-1.5 text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  Run Failure Details
                </span>
                <p className="font-mono text-[11px] text-red-800 break-words">
                  {String(selectedModel.metrics.error)}
                </p>
              </div>
            )}

            {/* Evaluation Telemetry Header */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                Evaluation Telemetry (Genuine Stored Metrics)
              </h4>
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-surface-subtle border border-border font-mono">
                <div>
                  <span className="text-charcoal-500 block text-[10px] font-sans">Macro F1</span>
                  <span className="text-base font-bold text-forest-800">
                    {typeof (selectedModel.metrics?.f1_score ?? selectedModel.metrics?.f1Score) === 'number'
                      ? `${(Number(selectedModel.metrics?.f1_score ?? selectedModel.metrics?.f1Score) * 100).toFixed(2)}%`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-500 block text-[10px] font-sans">Accuracy</span>
                  <span className="text-base font-bold text-charcoal-900">
                    {typeof selectedModel.metrics?.accuracy === 'number'
                      ? `${(selectedModel.metrics.accuracy * 100).toFixed(2)}%`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-500 block text-[10px] font-sans">Inference Latency</span>
                  <span className="text-base font-bold text-charcoal-900">
                    {typeof (selectedModel.metrics?.inference_latency_ms ?? selectedModel.metrics?.inferenceLatencyMs) === 'number'
                      ? `${selectedModel.metrics?.inference_latency_ms ?? selectedModel.metrics?.inferenceLatencyMs} ms`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-500 block text-[10px] font-sans">Precision</span>
                  <span className="text-sm font-semibold text-charcoal-800">
                    {typeof selectedModel.metrics?.precision === 'number'
                      ? `${(selectedModel.metrics.precision * 100).toFixed(2)}%`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-500 block text-[10px] font-sans">Recall</span>
                  <span className="text-sm font-semibold text-charcoal-800">
                    {typeof selectedModel.metrics?.recall === 'number'
                      ? `${(selectedModel.metrics.recall * 100).toFixed(2)}%`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-500 block text-[10px] font-sans">Loss</span>
                  <span className="text-sm font-semibold text-charcoal-800">
                    {typeof selectedModel.metrics?.loss === 'number'
                      ? selectedModel.metrics.loss.toFixed(4)
                      : '—'}
                  </span>
                </div>
              </div>
              {typeof (selectedModel.metrics?.f1_score ?? selectedModel.metrics?.f1Score) !== 'number' &&
                typeof selectedModel.metrics?.accuracy !== 'number' && (
                <p className="mt-2 text-[11px] text-charcoal-500 italic">
                  Evaluation metrics have not been recorded for this run yet. Run status is currently {selectedModel.status.toUpperCase()}.
                </p>
              )}
            </div>

            {/* Feature Importance Bar (if applicable) */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                Feature Importances
              </h4>
              {selectedModel.topFeatures && selectedModel.topFeatures.length > 0 ? (
                <div className="space-y-2 border border-border rounded-lg p-3 bg-surface">
                  {selectedModel.topFeatures.map(item => (
                    <div key={item.feature} className="space-y-1">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-charcoal-800">{item.feature}</span>
                        <span className="text-forest-800 font-semibold">
                          {(item.importance * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-surface-subtle h-1.5 rounded overflow-hidden">
                        <div
                          className="bg-forest-700 h-full rounded"
                          style={{ width: `${Math.min(item.importance * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-border rounded-lg text-charcoal-500 text-xs italic bg-surface-subtle">
                  Feature importances are not available for this run.
                </div>
              )}
            </div>

            {/* Features Used List (if recorded) */}
            {selectedModel.featuresUsed && selectedModel.featuresUsed.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                  Features Used ({selectedModel.featuresUsed.length})
                </h4>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-surface-subtle border border-border">
                  {selectedModel.featuresUsed.map(feat => (
                    <span
                      key={feat}
                      className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] font-mono text-charcoal-700"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hyperparameters Config */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-2 font-sans">
                Hyperparameter Configuration
              </h4>
              {selectedModel.hyperparameters && Object.keys(selectedModel.hyperparameters).length > 0 ? (
                <div className="p-3 rounded-lg bg-surface-subtle border border-border font-mono space-y-1.5">
                  {Object.entries(selectedModel.hyperparameters).map(([key, val]) => (
                    <div key={key} className="flex justify-between border-b border-border-subtle py-1">
                      <span className="text-charcoal-500">{key}:</span>
                      <span className="text-charcoal-900 font-semibold">{String(val)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-border rounded-lg text-charcoal-500 text-xs italic bg-surface-subtle">
                  No hyperparameters recorded for this run.
                </div>
              )}
            </div>

            {/* Artifact Location */}
            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 uppercase tracking-wider mb-1 font-sans">
                Model Artifact Checkpoint
              </h4>
              {selectedModel.artifactPath ? (
                <p className="p-2.5 rounded-lg bg-charcoal-900 text-charcoal-200 font-mono text-[11px] break-all">
                  {selectedModel.artifactPath}
                </p>
              ) : (
                <p className="p-2.5 rounded-lg bg-surface-subtle border border-border text-charcoal-500 italic font-mono text-[11px]">
                  No artifact checkpoint path recorded.
                </p>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Informational Stage Baseline Training Modal */}
      <Modal
        isOpen={isTrainModalOpen}
        onClose={() => setIsTrainModalOpen(false)}
        title="Stage Baseline Training & ML Integration"
        description="Collaborative ML development status and training handoff interface."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="p-3.5 rounded bg-forest-50 border border-forest-200 text-forest-900 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-forest-700 shrink-0" />
              <h4 className="font-semibold text-sm text-forest-950">
                Collaborative ML Development Handoff
              </h4>
            </div>
            <p className="text-forest-800 leading-relaxed">
              Actual training algorithms (Random Forest, Logistic Regression, and FedAvg) are being implemented independently by your teammate per the <strong>ML & Federated Learning Integration Contract</strong>.
            </p>
          </div>

          <div className="space-y-3 p-4 rounded border border-border bg-surface-subtle">
            <h5 className="font-semibold text-charcoal-900 uppercase tracking-wider text-[11px]">
              Integration Readiness & Pipeline Status
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="p-3 rounded bg-surface border border-border space-y-1">
                <span className="font-semibold text-charcoal-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-forest-700" />
                  Data Preparation Pipeline
                </span>
                <p className="text-charcoal-600 leading-relaxed">
                  Dataset upload, validation, missing value imputation, RobustScaler transformations, and stratified train/val/test splits are fully operational and ready for model ingestion.
                </p>
              </div>

              <div className="p-3 rounded bg-surface border border-border space-y-1">
                <span className="font-semibold text-charcoal-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-700" />
                  Model Training Engine
                </span>
                <p className="text-charcoal-600 leading-relaxed">
                  Baseline training execution will activate once the teammate’s ML/FL training modules and runner API are deployed.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded bg-surface border border-border space-y-1.5 text-charcoal-600">
            <span className="font-semibold text-charcoal-800 block text-xs">
              Zero Synthetic Metric Guarantee
            </span>
            <p className="leading-relaxed">
              In accordance with research integrity standards, SentinelFL does not insert synthetic model runs or generate fake evaluation metrics. Models will only appear in this registry once genuine training execution has successfully produced persistent model checkpoints.
            </p>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-border-subtle">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsTrainModalOpen(false)}
            >
              Understood
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
