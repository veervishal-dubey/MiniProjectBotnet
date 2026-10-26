import React, { useState, useEffect } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import {
  Database,
  Cpu,
  Network,
  ShieldAlert,
  ArrowRight,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  UserCheck,
  LogIn,
  UserPlus,
  LogOut,
  Shield,
  KeyRound,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { MetricCard } from '@/components/charts/MetricCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { RoundsConvergenceChart } from '@/components/charts/RoundsConvergenceChart';
import { ClassDistributionBar } from '@/components/charts/ClassDistributionBar';
import { storage } from '@/lib/storage';
import { Dataset } from '@/types/dataset';
import { ModelItem } from '@/types/model';
import { FLExperiment } from '@/types/federated';
import { DEMO_FLOW_RECORDS } from '@/api/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/components/ui/Toast';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDemoMode } = useOutletContext<{ isDemoMode: boolean }>();
  const { profile, isAuthenticated, isConfigured, signOut } = useAuth();
  const { workspace, counts } = useWorkspace();
  const { info } = useToast();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [experiment, setExperiment] = useState<FLExperiment | null>(null);

  const loadData = () => {
    const ds = storage.getDatasets(isDemoMode);
    const md = storage.getModels(isDemoMode);
    setDatasets(ds);
    setModels(md);
    if (isDemoMode) {
      setExperiment(storage.getActiveExperiment());
    } else {
      setExperiment(null);
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('sentinelfl:demomode-change', loadData);
    return () => window.removeEventListener('sentinelfl:demomode-change', loadData);
  }, [isDemoMode]);

  const handleSignOut = async () => {
    await signOut();
    info('Signed Out', 'You have been signed out of your researcher workspace.');
    navigate('/login', { replace: true });
  };

  // Aggregate metrics
  const totalFlows = datasets.reduce((sum, d) => sum + d.rowCount, 0);

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

      {/* Demo / Backend Status Banner */}
      {isDemoMode ? (
        <DisclaimerBanner
          type="demo"
          message="Displaying benchmark research findings from CICIoT2023 & BoT-IoT. All metrics represent empirical simulated FedAvg results."
        />
      ) : (
        <DisclaimerBanner
          type="backend-offline"
          message="FastAPI backend is offline. Ready to connect to Python FedAvg runtime at http://localhost:8000."
        />
      )}

      {/* Top Telemetry Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Dataset Count */}
        <MetricCard
          label="Workspace Datasets"
          value={isDemoMode ? datasets.length : counts.datasetCount}
          subValue={isDemoMode && totalFlows > 0 ? `(${totalFlows.toLocaleString()} flows)` : undefined}
          badge={{
            text: (isDemoMode ? datasets.length : counts.datasetCount) > 0 ? 'Ready' : 'Zero Records',
            variant: (isDemoMode ? datasets.length : counts.datasetCount) > 0 ? 'forest' : 'neutral',
          }}
          icon={<Database className="w-4 h-4" />}
          hint={isDemoMode ? 'Benchmark samples loaded' : 'Supabase verified storage'}
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
          hint={counts.preprocessingCount > 0 ? 'Feature scaling & splits' : 'No pipelines run'}
        />

        {/* Metric 3: Model Run Count */}
        <MetricCard
          label="Model Runs"
          value={counts.modelCount}
          subValue={counts.modelCount > 0 ? 'Trained checkpoints' : undefined}
          badge={{
            text: counts.modelCount > 0 ? 'Registered' : 'Zero Records',
            variant: counts.modelCount > 0 ? 'forest' : 'neutral',
          }}
          icon={<Activity className="w-4 h-4" />}
          hint={counts.modelCount > 0 ? 'RF & baseline models' : 'No models trained'}
        />

        {/* Metric 4: Federated Learning Round Count */}
        <MetricCard
          label="FL Communication Rounds"
          value={isDemoMode && experiment ? `Round ${experiment.currentRound}/${experiment.roundsTotal}` : counts.federatedRoundCount}
          subValue={isDemoMode && experiment ? '3 Edge Silos' : counts.federatedRoundCount > 0 ? 'Rounds aggregated' : undefined}
          badge={{
            text: isDemoMode ? (experiment?.status === 'completed' ? 'Converged' : 'Pending') : (counts.federatedRoundCount > 0 ? 'Recorded' : 'Zero Records'),
            variant: isDemoMode ? (experiment?.status === 'completed' ? 'forest' : 'amber') : (counts.federatedRoundCount > 0 ? 'forest' : 'neutral'),
          }}
          icon={<Network className="w-4 h-4" />}
          hint={isDemoMode ? 'Dirichlet Non-IID (α=0.5)' : 'FedAvg aggregation rounds'}
        />
      </div>

      {!isDemoMode && datasets.length === 0 ? (
        <EmptyState
          title="Clean Research Workspace"
          description="You are viewing an empty research environment without demonstration data. To begin, upload an IoT flow capture (CSV) or toggle Demo Mode in the top navigation."
          actionLabel="Upload Dataset"
          onAction={() => window.location.assign('/datasets')}
          secondaryActionLabel="Toggle Demo Mode"
          onSecondaryAction={() => {
            const s = storage.getSettings();
            s.useDemoData = true;
            storage.saveSettings(s);
            window.location.reload();
          }}
        />
      ) : (
        <>
          {/* Main Visual Panels: Federated Progress & Class Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Federated Learning Convergence Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span>Federated Model Convergence</span>
                    {isDemoMode && <Badge variant="demo">Demo Data</Badge>}
                  </CardTitle>
                  <CardDescription>
                    Multi-client sample-weighted FedAvg accuracy & cross-entropy loss over 15 communication rounds.
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
                  <div className="h-64 flex items-center justify-center text-xs text-charcoal-400">
                    No federated training rounds recorded.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attack Class Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Threat Distribution</CardTitle>
                <CardDescription>
                  Captured flow balance across benign and botnet attack classes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {datasets[0]?.classDistribution ? (
                  <ClassDistributionBar distribution={datasets[0].classDistribution} horizontal={true} />
                ) : (
                  <div className="h-48 flex items-center justify-center text-xs text-charcoal-400">
                    No dataset loaded
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
                  <span className="text-charcoal-500 font-mono">Dominant Attack</span>
                  <span className="font-semibold text-mutedRed-600 font-mono">Mirai-UDP_Flood (17.8%)</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Grid: IoT Client Readiness & Model Registry Snapshot */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 3 IoT Clients Status */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle>Federated Edge Silos</CardTitle>
                  <CardDescription>
                    Simulated client partitions with local sample weight allocation.
                  </CardDescription>
                </div>
                <Badge variant="forest" size="sm">3 Clients Synchronized</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {experiment?.clients.map(client => (
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
                        Weight: {(client.sampleWeight * 100).toFixed(1)}% (Acc: {( (client.localAccuracy || 0) * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions & Recent Model Checkpoints */}
            <Card>
              <CardHeader>
                <CardTitle>Model Artifact Registry</CardTitle>
                <CardDescription>
                  Centralized and federated model checkpoints ready for evaluation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {models.slice(0, 3).map(model => (
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
                          : '—'}
                      </div>
                      <div className="text-[10px] text-charcoal-400 font-mono">
                        Latency: {typeof model.metrics.inferenceLatencyMs === 'number' ? `${model.metrics.inferenceLatencyMs}ms` : '—'}
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
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
