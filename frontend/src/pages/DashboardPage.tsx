import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Database,
  Cpu,
  Network,
  ArrowRight,
  Activity,
  LogOut,
  Shield,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { MetricCard } from '@/components/charts/MetricCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { RoundsConvergenceChart } from '@/components/charts/RoundsConvergenceChart';
import { ClassDistributionBar } from '@/components/charts/ClassDistributionBar';
import { storage } from '@/lib/storage';
import { fetchWorkspaceDatasets } from '@/lib/datasetService';
import { apiClient } from '@/api/client';
import { Dataset } from '@/types/dataset';
import { ModelItem } from '@/types/model';
import { FLExperiment } from '@/types/federated';
import { ActiveDatasetSelector } from '@/components/common/ActiveDatasetSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useBackendHealth } from '@/contexts/BackendHealthContext';
import { useActiveDataset } from '@/contexts/ActiveDatasetContext';
import { useToast } from '@/components/ui/Toast';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isConfigured, signOut } = useAuth();
  const { workspace, counts } = useWorkspace();
  const { activeDataset, activePredictions } = useActiveDataset();
  const { status: backendStatus, message: backendMessage } = useBackendHealth();
  const { info } = useToast();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [experiment, setExperiment] = useState<FLExperiment | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch genuine workspace datasets
      let ds: Dataset[] = [];
      if (workspace?.id) {
        try {
          ds = await fetchWorkspaceDatasets(workspace.id);
        } catch (e) {
          console.warn('Could not fetch workspace datasets from Supabase:', e);
        }
      }
      if (ds.length === 0) {
        ds = storage.getDatasets(false);
      }
      setDatasets(ds);

      // 2. Fetch genuine registered models from FastAPI
      try {
        const { data: bModels } = await apiClient.getModels();
        setModels(bModels.filter(m => !m.isDemoSample));
      } catch {
        setModels([]);
      }

      // 3. Fetch genuine active or completed federated experiment
      try {
        const { data: exp } = await apiClient.getActiveExperiment();
        setExperiment(exp || null);
      } catch {
        setExperiment(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSignOut = async () => {
    await signOut();
    info('Signed Out', 'You have been signed out of your researcher workspace.');
    navigate('/login', { replace: true });
  };

  // Aggregate metrics
  const totalFlows = datasets.reduce((sum, d) => sum + (d.rowCount || 0), 0);

  // Compute prediction distribution from active model predictions if available
  const predictionDistribution = useMemo(() => {
    if (!activePredictions || !activePredictions.per_class_counts) return null;
    const total = activePredictions.total_flows;
    if (total === 0) return null;
    return Object.entries(activePredictions.per_class_counts).map(([className, count]) => ({
      className,
      count,
      percentage: activePredictions.per_class_percentages[className] ?? (count / total) * 100,
      isMalicious: className.toLowerCase() !== 'benign' && className.toLowerCase() !== 'rejected',
    }));
  }, [activePredictions]);

  // Compute dominant attack dynamically from active predictions, active dataset, or first workspace dataset
  const targetDataset = activeDataset || (datasets.length > 0 ? datasets[0] : null);
  const activeDisplayDistribution = predictionDistribution || targetDataset?.classDistribution || [];

  let dominantAttack: { name: string; percentage: number } | null = null;
  if (activeDisplayDistribution.length > 0) {
    const attacks = activeDisplayDistribution.filter(
      (c: { className: string; count: number; percentage: number }) =>
        c.className.toLowerCase() !== 'benign' && c.className.toLowerCase() !== 'rejected'
    );
    const sorted = attacks.length > 0
      ? [...attacks].sort((a, b) => b.count - a.count)
      : [...activeDisplayDistribution].sort((a, b) => b.count - a.count);
    if (sorted[0]) {
      dominantAttack = {
        name: sorted[0].className,
        percentage: sorted[0].percentage,
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* Researcher Authentication & Session Banner */}
      <Card className="border-forest-900/10 bg-gradient-to-r from-surface to-surface-subtle overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-lg bg-forest-800 text-forest-100 border border-forest-700 flex items-center justify-center font-bold text-sm shadow-subtle flex-shrink-0">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : <Shield className="w-5 h-5 text-forest-200" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm sm:text-base text-charcoal-900 tracking-tight">
                  {profile?.name || 'Authenticated Researcher'}
                </span>
                <Badge variant="forest" size="sm" dot>
                  Supabase Authenticated
                </Badge>
                {workspace && (
                  <Badge variant="outline" size="sm" className="font-mono text-forest-800 border-forest-300 bg-forest-50/70">
                    Workspace: {workspace.name}
                  </Badge>
                )}
                {activeDataset && (
                  <Badge variant="sage" size="sm">
                    Active Dataset: {activeDataset.name}
                  </Badge>
                )}
                {isConfigured && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-charcoal-600">
                    Auth Engine Online
                  </span>
                )}
              </div>
              <p className="text-xs text-charcoal-500 mt-0.5 font-mono">
                {profile?.email || 'researcher@workspace'} • Role: {profile?.role || 'Researcher'} {profile?.organization ? `• ${profile.organization}` : ''}
              </p>
            </div>
          </div>

          {/* Quick Authentication Actions directly on Dashboard */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <Link to="/settings">
              <Button variant="outline" size="sm" className="text-xs">
                Account Settings
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-xs text-mutedRed-600 hover:text-mutedRed-700 hover:bg-mutedRed-50"
              leftIcon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </Card>

      {/* Backend Status Notification (only rendered when backend is disconnected) */}
      {backendStatus === 'offline' && (
        <DisclaimerBanner
          type="backend-offline"
          message={backendMessage || 'FastAPI backend is offline. Start the server at http://localhost:8000 to enable real-time inference and training.'}
        />
      )}

      {/* Persistent Global Active Dataset Selector */}
      <ActiveDatasetSelector />

      {/* Top Telemetry Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Dataset Count */}
        <MetricCard
          label="Workspace Datasets"
          value={datasets.length > 0 ? datasets.length : counts.datasetCount}
          subValue={totalFlows > 0 ? `(${totalFlows.toLocaleString()} flows)` : undefined}
          badge={{
            text: (datasets.length > 0 || counts.datasetCount > 0) ? 'Ready' : 'Zero Records',
            variant: (datasets.length > 0 || counts.datasetCount > 0) ? 'forest' : 'neutral',
          }}
          icon={<Database className="w-4 h-4" />}
          hint={(datasets.length > 0 || counts.datasetCount > 0) ? 'Workspace datasets stored' : 'No datasets uploaded yet'}
        />

        {/* Metric 2: Preprocessing Job Count */}
        <MetricCard
          label="Preprocessing Jobs"
          value={counts.preprocessingCount}
          subValue={counts.preprocessingCount > 0 ? 'Staged pipelines' : undefined}
          badge={{
            text: counts.preprocessingCount > 0 ? 'Active' : 'Zero Records',
            variant: counts.preprocessingCount > 0 ? 'forest' : 'neutral',
          }}
          icon={<Cpu className="w-4 h-4" />}
          hint={counts.preprocessingCount > 0 ? 'Feature scaling & splits' : 'No preprocessing jobs yet'}
        />

        {/* Metric 3: Model Runs & Registry */}
        <MetricCard
          label="Registered Models"
          value={models.length > 0 ? models.length : counts.modelCount}
          subValue={models.length > 0 ? `${models.length} registered models` : (counts.modelCount > 0 ? 'Trained checkpoints' : undefined)}
          badge={{
            text: (models.length > 0 || counts.modelCount > 0) ? 'Trained' : 'Zero Records',
            variant: (models.length > 0 || counts.modelCount > 0) ? 'forest' : 'neutral',
          }}
          icon={<Activity className="w-4 h-4" />}
          hint={(models.length > 0 || counts.modelCount > 0) ? 'PyTorch MLP baseline and Federated Global checkpoints' : 'No verified model runs available'}
        />

        {/* Metric 4: Federated Learning Round Count */}
        <MetricCard
          label="FL Communication Rounds"
          value={experiment && experiment.roundsHistory.length > 0 ? `Round ${experiment.currentRound}/${experiment.roundsTotal}` : counts.federatedRoundCount}
          subValue={experiment && experiment.clients.length > 0 ? `${experiment.clients.length} Edge Gateways` : (counts.federatedRoundCount > 0 ? 'Rounds aggregated' : undefined)}
          badge={{
            text: experiment && experiment.roundsHistory.length > 0
              ? 'Saved FL Experiment'
              : (counts.federatedRoundCount > 0 ? 'Recorded' : 'Zero Records'),
            variant: experiment && experiment.roundsHistory.length > 0
              ? 'forest'
              : (counts.federatedRoundCount > 0 ? 'forest' : 'neutral'),
          }}
          icon={<Network className="w-4 h-4" />}
          hint={experiment && experiment.roundsHistory.length > 0 ? `${experiment.roundsHistory.length} FedAvg aggregation rounds (Saved Experiment: ${experiment.id})` : 'No federated training results available'}
        />
      </div>

      {/* Main Visual Panels: Federated Progress & Threat Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Federated Learning Convergence Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Federated Model Convergence</CardTitle>
                <Badge variant="neutral" size="sm">Saved FL Experiment</Badge>
              </div>
              <CardDescription>
                {experiment && experiment.roundsHistory.length > 0
                  ? `Saved Experiment: ${experiment.name} (${experiment.id}) — sample-weighted FedAvg accuracy & cross-entropy loss over ${experiment.roundsHistory.length} communication rounds.`
                  : 'Multi-client sample-weighted FedAvg convergence metrics.'}
              </CardDescription>
            </div>
            <Link to="/federated-learning">
              <Button size="sm" variant="outline" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Experiment Details
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {experiment && experiment.roundsHistory.length > 0 ? (
              <RoundsConvergenceChart roundsHistory={experiment.roundsHistory} />
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-xs text-charcoal-400 gap-2">
                <span>No training history available</span>
                <span className="text-[11px] text-charcoal-400">Launch a Federated Training job in the Federated Learning page to generate convergence history.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Threat Distribution Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Threat Distribution</CardTitle>
              {predictionDistribution ? (
                <Badge variant="forest" size="sm" dot>PyTorch Model Predictions</Badge>
              ) : activeDataset ? (
                <Badge variant="forest" size="sm" dot>Active Dataset</Badge>
              ) : targetDataset ? (
                <Badge variant="neutral" size="sm">Default Workspace</Badge>
              ) : null}
            </div>
            <CardDescription>
              {predictionDistribution && activePredictions
                ? `Model: ${activePredictions.model_id || activePredictions.model_version} • ${activePredictions.total_flows.toLocaleString()} flows classified (${activePredictions.malicious_count.toLocaleString()} malicious, ${activePredictions.benign_count.toLocaleString()} benign)`
                : targetDataset
                ? `Source: ${targetDataset.name} • ${targetDataset.rowCount.toLocaleString()} flows`
                : 'No dataset selected or available in workspace.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeDisplayDistribution && activeDisplayDistribution.length > 0 ? (
              <>
                <ClassDistributionBar distribution={activeDisplayDistribution} horizontal={true} />
                <div className="mt-4 pt-3 border-t border-border-subtle space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal-500 font-sans">Dataset Identifier</span>
                    <span className="font-semibold text-charcoal-900 text-[11px] truncate max-w-[190px]" title={targetDataset?.id || 'Active Predictions'}>
                      {targetDataset ? `${targetDataset.name} (${targetDataset.id.slice(0, 10)}...)` : 'Active Classification Run'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal-500 font-sans">Total Records Represented</span>
                    <span className="font-semibold text-charcoal-900">
                      {(predictionDistribution && activePredictions ? activePredictions.total_flows : (targetDataset?.rowCount || 0)).toLocaleString()} flows
                    </span>
                  </div>
                  {dominantAttack && (
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal-500 font-sans">Dominant Attack</span>
                      <span className="font-semibold text-mutedRed-600">
                        {dominantAttack.name} ({dominantAttack.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  <div className="pt-2 flex items-center justify-between font-sans">
                    <Link to="/detection" className="text-forest-700 hover:text-forest-900 text-[11px] font-medium hover:underline inline-flex items-center gap-1">
                      <span>Explore in Flow Detection</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                    <Link to="/datasets" className="text-charcoal-500 hover:text-charcoal-700 text-[11px] font-medium hover:underline inline-flex items-center gap-1">
                      <span>{activeDataset ? 'Change Active Dataset' : 'Select for Analysis'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-xs text-charcoal-400 text-center px-4 gap-2">
                <span>Upload a dataset and generate predictions to view the threat distribution</span>
                <Link to="/datasets">
                  <Button size="sm" variant="outline" className="text-xs">
                    Select Dataset in Management
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid: IoT Client Readiness & Model Registry Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Federated Edge Gateways */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Federated Edge Gateways</CardTitle>
              <CardDescription>
                {experiment
                  ? `Client partitions with empirical sample weight allocation (${experiment.partitionStrategy || 'IID'}).`
                  : 'Edge node partitions ready for federated aggregation.'}
              </CardDescription>
            </div>
            {experiment?.clients && experiment.clients.length > 0 ? (
              <Badge variant="forest" size="sm">
                {experiment.clients.length} Clients Synchronized
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Zero Clients
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {experiment?.clients && experiment.clients.length > 0 ? (
              experiment.clients.map(client => (
                <div
                  key={client.id}
                  className="p-3 rounded border border-border bg-surface-subtle/50 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-charcoal-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-forest-600" />
                      {client.name}
                    </div>
                    <p className="text-charcoal-500 font-mono mt-0.5 text-[11px]">
                      {client.deviceTypes.join(', ')}
                    </p>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-charcoal-900 font-medium">
                      {client.sampleCount.toLocaleString()} samples
                    </div>
                    <div className="text-[11px] text-forest-700">
                      Weight: {(client.sampleWeight * 100).toFixed(1)}% {typeof client.localAccuracy === 'number' ? `(Acc: ${(client.localAccuracy * 100).toFixed(1)}%)` : ''}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-charcoal-400">
                No federated training results available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Artifact Registry Snapshot */}
        <Card>
          <CardHeader>
            <CardTitle>Model Artifact Registry</CardTitle>
            <CardDescription>
              Verified model checkpoints and baselines available in the runtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {models.length > 0 ? (
              <>
                {models.slice(0, 4).map(model => (
                  <div
                    key={model.id}
                    className="p-3 rounded border border-border bg-surface-subtle/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-charcoal-900">{model.name}</div>
                      <div className="text-[11px] text-charcoal-500 font-mono mt-0.5">
                        Version: {model.version} • Arch: {model.architecture}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-semibold text-forest-800">
                        {typeof model.metrics.f1Score === 'number'
                          ? `${(model.metrics.f1Score * 100).toFixed(1)}% F1`
                          : typeof model.metrics.accuracy === 'number'
                          ? `${(model.metrics.accuracy * 100).toFixed(1)}% Acc`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-charcoal-400 font-mono">
                        {typeof model.metrics.inferenceLatencyMs === 'number' && model.metrics.inferenceLatencyMs > 0
                          ? `Latency: ${model.metrics.inferenceLatencyMs}ms`
                          : model.paradigm === 'federated_global' ? 'FedAvg' : 'PyTorch'}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-2 flex items-center justify-between text-xs border-t border-border-subtle">
                  <Link to="/models" className="text-forest-800 font-medium hover:underline flex items-center gap-1">
                    <span>Manage all models</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link to="/detection">
                    <Button size="sm" variant="secondary">
                      Run Inference
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-xs text-charcoal-400">
                No verified model runs available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
