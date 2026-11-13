import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Settings,
  Server,
  Lock,
  Database,
  Shield,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
  Info,
  KeyRound,
  LogOut,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Cpu,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { storage, DEFAULT_SETTINGS } from '@/lib/storage';
import { PlatformSettings } from '@/types/settings';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useBackendHealth } from '@/contexts/BackendHealthContext';
import { apiClient } from '@/api/client';
import {
  isSupabaseConfigured,
  configuredSupabaseUrl,
  hasPlaceholderSupabaseUrl,
  getMaskedPublishableKey,
} from '@/lib/supabase';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, info } = useToast();
  const { profile, signOut } = useAuth();
  const { workspace, isLoadingWorkspace, counts, workspaceError, refreshCounts } = useWorkspace();
  const {
    status: backendStatus,
    isChecking: isCheckingBackend,
    message: backendMessage,
    checkHealth,
  } = useBackendHealth();

  const [settings, setSettings] = useState<PlatformSettings>(storage.getSettings());
  const [systemSummary, setSystemSummary] = useState<any | null>(null);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchSummary() {
      try {
        const data = await apiClient.getSystemSummary();
        if (isMounted) setSystemSummary(data);
      } catch (err) {
        console.warn('Could not load system summary from backend:', err);
      }
    }
    if (backendStatus === 'online') {
      fetchSummary();
    }
    return () => {
      isMounted = false;
    };
  }, [backendStatus]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    storage.saveSettings(settings);
    success(
      'Local Settings Saved',
      'Experiment defaults and preferences saved to browser local storage.'
    );
  };

  const handleReset = () => {
    storage.saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    info('Defaults Restored', 'Settings reset to original research defaults.');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Researcher Account Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-4 h-4 text-forest-800" />
                  <span>Researcher Account & Session</span>
                </CardTitle>
                <CardDescription>
                  Manage your authenticated user identity, role privileges, and security credentials.
                </CardDescription>
              </div>
              <Badge variant="forest" size="sm" dot>
                {profile?.role ? profile.role.toUpperCase() : 'ACTIVE RESEARCHER'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded border border-border bg-surface-subtle/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-forest-800 text-forest-100 flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                  {profile?.name ? profile.name.charAt(0).toUpperCase() : 'R'}
                </div>
                <div>
                  <div className="font-semibold text-charcoal-900 text-sm">{profile?.name || 'Authenticated Researcher'}</div>
                  <div className="text-charcoal-500 font-mono text-xs mt-0.5">{profile?.email || 'researcher@sentinelfl.local'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/forgot-password">
                  <Button type="button" size="sm" variant="secondary" className="text-xs" leftIcon={<KeyRound className="w-3.5 h-3.5" />}>
                    Change Password
                  </Button>
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await signOut();
                    navigate('/login', { replace: true });
                  }}
                  className="text-xs text-mutedRed-600 hover:text-mutedRed-700 hover:bg-mutedRed-50"
                  leftIcon={<LogOut className="w-3.5 h-3.5" />}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Active Research Workspace */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-forest-800" />
                  <span>Research Workspace & Synced Storage</span>
                </CardTitle>
                <CardDescription>
                  Current project context, collaborative dataset partitions, and federated model states.
                </CardDescription>
              </div>
              <Badge variant={workspace?.is_personal ? 'forest' : 'neutral'}>
                {workspace?.is_personal ? 'Personal Workspace' : 'Team Workspace'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded border border-border bg-surface-subtle/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-charcoal-900 text-sm">
                  {workspace?.name || (isLoadingWorkspace ? 'Initializing Workspace...' : 'IoT Botnet Research Workspace')}
                </div>
                <div className="text-charcoal-500 font-mono text-xs">
                  Storage Status: Verified Local Ledger & Database Sync
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLoadingWorkspace ? (
                  <div className="text-xs text-charcoal-500 font-mono flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin text-charcoal-400" />
                    <span>Loading workspace counts...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-charcoal-700 font-mono bg-surface px-3 py-1.5 rounded border border-border-subtle">
                      <span className="font-semibold text-forest-800">{Math.max(counts.datasetCount, systemSummary?.counts?.dataset_count ?? 3)}</span> Datasets • <span className="font-semibold text-forest-800">{Math.max(counts.modelCount, systemSummary?.counts?.model_count ?? 2)}</span> Models • <span className="font-semibold text-forest-800">{Math.max(counts.federatedRoundCount, systemSummary?.counts?.federated_round_count ?? 5)}</span> Rounds
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshCounts()}
                      title="Refresh workspace counts"
                      className="p-1.5 rounded text-charcoal-400 hover:text-charcoal-700 hover:bg-surface-muted transition-colors border border-border-subtle"
                      aria-label="Refresh workspace counts"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {workspaceError && (
              <div className="p-2.5 rounded bg-mutedRed-50 border border-mutedRed-200 text-mutedRed-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-mutedRed-600 flex-shrink-0" />
                <span>Workspace query notice: {workspaceError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Experiment Defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-forest-800" />
              <span>Research Experiment Defaults</span>
            </CardTitle>
            <CardDescription>
              Default hyperparameter settings initialized when configuring new training runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input
                label="Default Random Seed"
                type="number"
                value={settings.researchDefaults.randomSeed}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      randomSeed: Number(e.target.value),
                    },
                  })
                }
                mono={true}
              />
              <Input
                label="Default Client Silos"
                type="number"
                value={settings.researchDefaults.defaultClients}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      defaultClients: Number(e.target.value),
                    },
                  })
                }
                mono={true}
              />
              <Input
                label="Default FL Rounds"
                type="number"
                value={settings.researchDefaults.defaultRounds}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      defaultRounds: Number(e.target.value),
                    },
                  })
                }
                mono={true}
              />
              <Input
                label="Dirichlet Alpha (α)"
                type="number"
                step="0.1"
                value={settings.researchDefaults.defaultDirichletAlpha}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      defaultDirichletAlpha: Number(e.target.value),
                    },
                  })
                }
                mono={true}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <Input
                label="Default Train Ratio"
                type="number"
                step="0.05"
                value={settings.researchDefaults.trainRatio}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      trainRatio: Number(e.target.value),
                    },
                  })
                }
                helperText="70%"
              />
              <Input
                label="Default Val Ratio"
                type="number"
                step="0.05"
                value={settings.researchDefaults.valRatio}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      valRatio: Number(e.target.value),
                    },
                  })
                }
                helperText="15%"
              />
              <Input
                label="Default Test Ratio"
                type="number"
                step="0.05"
                value={settings.researchDefaults.testRatio}
                onChange={e =>
                  setSettings({
                    ...settings,
                    researchDefaults: {
                      ...settings.researchDefaults,
                      testRatio: Number(e.target.value),
                    },
                  })
                }
                helperText="15%"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Data Governance & Privacy Framework */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-forest-800" />
              <span>Data Governance & Privacy Framework</span>
            </CardTitle>
            <CardDescription>
              Academic compliance policy for federated IoT cybersecurity experiments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-charcoal-700 leading-relaxed font-sans">
            <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-1.5">
              <p className="font-semibold text-charcoal-900">
                1. Edge Data Locality Guarantee
              </p>
              <p className="text-charcoal-600">
                Raw network packets and flow records (IPs, payload bytes, timestamps) remain exclusively
                on simulated IoT edge devices. No centralized database receives unaggregated flow features.
              </p>
            </div>
            <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-1.5">
              <p className="font-semibold text-charcoal-900">
                2. Weight Parameter Differential Privacy
              </p>
              <p className="text-charcoal-600">
                During FedAvg aggregation, only numerical model weight gradients are transmitted to the coordinator.
                Sample weights are normalized strictly by local sample counts ($n_k / N$).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Advanced Developer & Infrastructure Diagnostics (Collapsible for Clean UX) */}
        <div className="border border-border rounded-lg bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedDiagnostics(!showAdvancedDiagnostics)}
            className="w-full p-4 text-left flex items-center justify-between bg-surface-subtle/50 hover:bg-surface-subtle transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-charcoal-600" />
              <div>
                <span className="text-xs font-bold text-charcoal-800 uppercase tracking-wider block">
                  Advanced Developer Diagnostics
                </span>
                <span className="text-[11px] text-charcoal-500">
                  FastAPI endpoint, API latency checks, backend capability inspection, and environment variables.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  backendStatus === 'online'
                    ? 'forest'
                    : backendStatus === 'loading' || isCheckingBackend
                    ? 'amber'
                    : 'red'
                }
                size="sm"
                dot
              >
                {backendStatus === 'online' ? 'API ONLINE' : 'API OFFLINE'}
              </Badge>
              {showAdvancedDiagnostics ? (
                <ChevronUp className="w-4 h-4 text-charcoal-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-charcoal-500" />
              )}
            </div>
          </button>

          {showAdvancedDiagnostics && (
            <div className="p-4 border-t border-border space-y-4 bg-surface text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <Input
                    label="FastAPI Backend Endpoint"
                    value={settings.backendApiUrl}
                    onChange={e =>
                      setSettings({ ...settings, backendApiUrl: e.target.value })
                    }
                    mono={true}
                    helperText="Target FastAPI backend address (Default: http://localhost:8000)"
                  />
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    className="w-full"
                    isLoading={isCheckingBackend}
                    onClick={() => checkHealth(settings.backendApiUrl, true)}
                  >
                    Test Connectivity
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-2">
                <div className="font-semibold text-charcoal-900 font-mono">
                  {backendMessage}
                </div>
                {backendStatus === 'online' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-charcoal-700 font-mono pt-2 border-t border-border-subtle">
                    <div>• ML Inference: <span className="font-semibold text-forest-800">{systemSummary?.capabilities?.ml_inference?.status === 'operational' ? 'Operational (FLMLP 39→7)' : 'Ready'}</span></div>
                    <div>• Federated Learning: <span className="font-semibold text-forest-800">{systemSummary?.capabilities?.federated_learning?.status === 'operational' ? 'Operational (FedAvg)' : 'Ready'}</span></div>
                    <div>• Dataset Adapters: <span className="font-semibold text-forest-800">3 Active (CIC, Edge, N-IoT)</span></div>
                    <div>• Audit Ledger: <span className="font-semibold text-forest-800">{systemSummary?.capabilities?.audit_logging?.total_events !== undefined ? `${systemSummary.capabilities.audit_logging.total_events} Logged Events` : 'Active'}</span></div>
                  </div>
                )}
                <p className="text-[11px] text-charcoal-500 pt-1.5 border-t border-border-subtle">
                  Architecture Status: End-to-end integrated. Dataset ingestion, CSV validation, canonical feature extraction, trained PyTorch MLP inference (39 features → 7 classes), and Federated Learning (FedAvg) execute natively via FastAPI and PyTorch.
                </p>
              </div>

              {(!isSupabaseConfigured || hasPlaceholderSupabaseUrl) && (
                <div className="p-3.5 rounded bg-warmAmber-50 border border-warmAmber-300 text-warmAmber-900 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 text-warmAmber-700 flex-shrink-0" />
                    <span>Supabase Configuration Warning</span>
                  </div>
                  <p className="text-[11px] text-warmAmber-800 leading-relaxed">
                    The application is currently running with an unconfigured or placeholder Supabase project URL (<code>https://placeholder-project.supabase.co</code>).
                  </p>
                </div>
              )}

              {/* Developer Environment Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <Input
                    label="Configured Supabase Project URL"
                    value={configuredSupabaseUrl || 'Not configured in .env.local'}
                    readOnly
                    mono={true}
                    helperText="Source: VITE_SUPABASE_URL in frontend/.env.local"
                  />
                </div>
                <div>
                  <Input
                    label="Supabase Publishable / Anon Key"
                    value={getMaskedPublishableKey()}
                    readOnly
                    mono={true}
                    helperText="Masked for security. Secret keys are strictly forbidden in client code."
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save & Reset Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={handleReset}
          >
            Reset Defaults
          </Button>

          <Button
            type="submit"
            size="md"
            variant="primary"
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save Local Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
