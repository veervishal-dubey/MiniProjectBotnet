import React, { useState } from 'react';
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
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Backend Connection Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-forest-800" />
                  <span>Backend & API Connectivity</span>
                </CardTitle>
                <CardDescription>
                  Configure endpoints for FastAPI backend and data preprocessing services.
                </CardDescription>
              </div>
              <Badge
                variant={
                  backendStatus === 'online'
                    ? 'forest'
                    : backendStatus === 'loading' || isCheckingBackend
                    ? 'amber'
                    : backendStatus === 'error'
                    ? 'red'
                    : 'neutral'
                }
                dot
              >
                {backendStatus === 'online'
                  ? 'ONLINE'
                  : backendStatus === 'loading' || isCheckingBackend
                  ? 'CHECKING...'
                  : backendStatus === 'error'
                  ? 'ERROR'
                  : 'OFFLINE'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <Input
                  label="FastAPI Base URL"
                  value={settings.backendApiUrl}
                  onChange={e =>
                    setSettings({ ...settings, backendApiUrl: e.target.value })
                  }
                  mono={true}
                  helperText="Configured FastAPI backend address (Default: http://localhost:8000)"
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
                  Test Connection
                </Button>
              </div>
            </div>

            <div className="p-3.5 rounded bg-surface-subtle border border-border-subtle flex items-start gap-2.5 text-xs">
              <Info className="w-4 h-4 text-charcoal-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <div className="font-semibold text-charcoal-900 font-mono">
                  {backendMessage}
                </div>

                {backendStatus === 'offline' && (
                  <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                    <p className="font-medium">
                      FastAPI backend server is unreachable. Ingestion and leak-free preprocessing require an active backend server.
                    </p>
                    <p className="text-[11px] text-charcoal-600">
                      Launch the FastAPI backend locally using:
                    </p>
                    <code className="block p-2 rounded bg-charcoal-900 text-charcoal-100 font-mono text-[11px] select-all">
                      py -3.13 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
                    </code>
                  </div>
                )}

                {backendStatus === 'online' && (
                  <p className="text-[11px] text-forest-700">
                    FastAPI server is operational. Ready for dataset parsing, schema validation, and leak-free train/val/test splits.
                  </p>
                )}

                <p className="text-[11px] text-charcoal-500 pt-1.5 border-t border-border-subtle">
                  Architecture Status: Dataset ingestion, CSV validation, and preprocessing pipelines execute via FastAPI. Centralized ML baseline training and Federated Learning (FedAvg) are pending teammate implementation and integration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Supabase & Authentication */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-forest-800" />
                  <span>Researcher Authentication & Supabase</span>
                </CardTitle>
                <CardDescription>
                  Supabase Auth integration, session management, and project credentials.
                </CardDescription>
              </div>
              <Badge
                variant={isSupabaseConfigured && !hasPlaceholderSupabaseUrl ? 'forest' : 'amber'}
                dot
              >
                {isSupabaseConfigured && !hasPlaceholderSupabaseUrl
                  ? 'CONNECTED (.env.local)'
                  : 'CONFIGURATION REQUIRED'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning if Supabase URL is placeholder or unconfigured */}
            {(!isSupabaseConfigured || hasPlaceholderSupabaseUrl) && (
              <div className="p-3.5 rounded bg-warmAmber-50 border border-warmAmber-300 text-warmAmber-900 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="w-4 h-4 text-warmAmber-700 flex-shrink-0" />
                  <span>Supabase Configuration Warning</span>
                </div>
                <p className="text-[11px] text-warmAmber-800 leading-relaxed">
                  The application is currently running with an unconfigured or placeholder Supabase project URL (<code>https://placeholder-project.supabase.co</code>). To enable authentic user registration, dataset storage, and row-level security, set your genuine project credentials in <code className="font-mono bg-warmAmber-100 px-1 py-0.5 rounded">frontend/.env.local</code> (<code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>).
                </p>
              </div>
            )}

            {/* Active profile snapshot */}
            <div className="p-3.5 rounded border border-border bg-surface-subtle/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-forest-800 text-forest-100 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {profile?.name ? profile.name.charAt(0).toUpperCase() : 'R'}
                </div>
                <div>
                  <div className="font-semibold text-charcoal-900">{profile?.name || 'Authenticated Researcher'}</div>
                  <div className="text-charcoal-500 font-mono text-[11px]">{profile?.email} • Role: {profile?.role || 'Researcher'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/forgot-password">
                  <Button type="button" size="sm" variant="secondary" className="text-xs" leftIcon={<KeyRound className="w-3.5 h-3.5" />}>
                    Reset Password
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

            {/* Active Workspace Snapshot */}
            <div className="p-3.5 rounded border border-border bg-surface-subtle/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-forest-100 text-forest-900 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-forest-300">
                  <Layers className="w-4 h-4 text-forest-800" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-charcoal-900">
                      {workspace?.name || (isLoadingWorkspace ? 'Initializing Workspace...' : 'Personal Research Workspace')}
                    </span>
                    <Badge variant={workspace?.is_personal ? 'forest' : 'neutral'}>
                      {workspace?.is_personal ? 'Personal' : 'Team'}
                    </Badge>
                  </div>
                  <div className="text-charcoal-500 font-mono text-[11px] mt-0.5">
                    ID: {workspace?.id || '—'} {workspace?.isFallback ? '(Local Isolated Session)' : '• Verified Supabase RLS'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                {isLoadingWorkspace ? (
                  <div className="text-[11px] text-charcoal-500 font-mono flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin text-charcoal-400" />
                    <span>Loading workspace counts...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-charcoal-600 font-mono">
                      <span className="font-semibold text-charcoal-900">{counts.datasetCount}</span> Datasets • <span className="font-semibold text-charcoal-900">{counts.modelCount}</span> Models • <span className="font-semibold text-charcoal-900">{counts.federatedRoundCount}</span> Rounds
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshCounts()}
                      title="Refresh workspace counts from database"
                      className="p-1 rounded text-charcoal-400 hover:text-charcoal-700 hover:bg-surface-muted transition-colors"
                      aria-label="Refresh workspace counts"
                    >
                      <RefreshCw className="w-3 h-3" />
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

            {/* Supabase URL and Key - Environment-driven source of truth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Supabase Project URL"
                  value={configuredSupabaseUrl || 'Not configured in .env.local'}
                  readOnly
                  mono={true}
                  helperText="Source of truth: VITE_SUPABASE_URL in frontend/.env.local"
                />
              </div>
              <div>
                <Input
                  label="Supabase Publishable / Anon Key"
                  value={getMaskedPublishableKey()}
                  readOnly
                  mono={true}
                  helperText="Masked for security. Secret service-role keys are strictly forbidden in client code."
                />
              </div>
            </div>
            <p className="text-[11px] text-charcoal-500 font-mono">
              Configuration Note: Active Supabase credentials are read exclusively from environment variables in <code className="text-forest-800">frontend/.env.local</code>.
            </p>
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
