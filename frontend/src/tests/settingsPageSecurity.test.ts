import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configuredSupabaseUrl,
  hasPlaceholderSupabaseUrl,
  getMaskedPublishableKey,
} from '../lib/supabase';
import { DEFAULT_SETTINGS } from '../lib/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// 1. SUPABASE CONFIGURATION DISPLAY & SECRETS SAFETY
// ==============================================================================

test('supabase.ts exports masked key helper and never exposes plain text anon/service keys', () => {
  const maskedValid = getMaskedPublishableKey('sb_publishable_ltROmB53Ii0zQG67kVoiLg_O0v6FkVo');
  assert.strictEqual(maskedValid.includes('••••'), true, 'Configured key must be masked with bullet characters');
  assert.strictEqual(maskedValid.startsWith('sb_publishable_'), true, 'Must preserve key type prefix');
  assert.strictEqual(maskedValid.includes('service_role'), false, 'Must never contain service_role');

  const maskedPlaceholder = getMaskedPublishableKey('placeholder-anon-key');
  assert.strictEqual(maskedPlaceholder, 'Not configured in .env.local');

  const maskedEmpty = getMaskedPublishableKey('');
  assert.strictEqual(maskedEmpty, 'Not configured in .env.local');
});

test('supabase.ts contains no references to SUPABASE_SERVICE_ROLE_KEY or service keys', () => {
  const supabasePath = path.resolve(__dirname, '../lib/supabase.ts');
  const content = fs.readFileSync(supabasePath, 'utf-8');

  assert.strictEqual(
    content.includes('SERVICE_ROLE'),
    false,
    'Client-side Supabase file must never reference SERVICE_ROLE'
  );
  assert.strictEqual(
    content.includes('service_role'),
    false,
    'Client-side Supabase file must never reference service_role'
  );
});

test('DEFAULT_SETTINGS does not contain hardcoded placeholder Supabase credentials', () => {
  assert.strictEqual(
    DEFAULT_SETTINGS.supabaseUrl.includes('placeholder-project.supabase.co'),
    false,
    'DEFAULT_SETTINGS.supabaseUrl must not be hardcoded to placeholder'
  );
  assert.strictEqual(
    DEFAULT_SETTINGS.supabaseAnonKey.includes('placeholder'),
    false,
    'DEFAULT_SETTINGS.supabaseAnonKey must not be hardcoded to placeholder JWT'
  );
});

test('SettingsPage.tsx uses VITE_SUPABASE_URL and configuredSupabaseUrl as source of truth', () => {
  const pagePath = path.resolve(__dirname, '../pages/SettingsPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf-8');

  assert.strictEqual(
    content.includes('configuredSupabaseUrl'),
    true,
    'SettingsPage must use configuredSupabaseUrl'
  );
  assert.strictEqual(
    content.includes('getMaskedPublishableKey'),
    true,
    'SettingsPage must display masked key via getMaskedPublishableKey'
  );
  assert.strictEqual(
    content.includes('Supabase Configuration Warning'),
    true,
    'SettingsPage must display warning when unconfigured or placeholder'
  );
});

// ==============================================================================
// 2. BACKEND HEALTH SYNCHRONIZATION & REMOVAL OF PHASE 1 MESSAGING
// ==============================================================================

test('TopNav.tsx and SettingsPage.tsx both use BackendHealthContext for synchronized real status', () => {
  const topNavPath = path.resolve(__dirname, '../components/layout/TopNav.tsx');
  const topNavContent = fs.readFileSync(topNavPath, 'utf-8');

  const settingsPath = path.resolve(__dirname, '../pages/SettingsPage.tsx');
  const settingsContent = fs.readFileSync(settingsPath, 'utf-8');

  assert.strictEqual(
    topNavContent.includes('useBackendHealth'),
    true,
    'TopNav must consume useBackendHealth'
  );
  assert.strictEqual(
    settingsContent.includes('useBackendHealth'),
    true,
    'SettingsPage must consume useBackendHealth'
  );
});

test('SettingsPage.tsx does not contain misleading Phase 1 browser simulation text', () => {
  const settingsPath = path.resolve(__dirname, '../pages/SettingsPage.tsx');
  const content = fs.readFileSync(settingsPath, 'utf-8');

  assert.strictEqual(
    content.includes('run independently inside the browser'),
    false,
    'Must not claim simulation runs independently inside the browser'
  );
  assert.strictEqual(
    content.includes('(Expected during Phase 1)'),
    false,
    'Must not claim backend disconnection is expected during Phase 1'
  );
  assert.strictEqual(
    content.includes('frontend-isolated mode'),
    false,
    'Must not claim operating in frontend-isolated mode'
  );
  assert.strictEqual(
    content.includes('pending teammate implementation and integration'),
    true,
    'Must clearly indicate training integration is pending'
  );
});

test('BackendHealthContext initializes in loading state and never reports online before response', () => {
  const contextPath = path.resolve(__dirname, '../contexts/BackendHealthContext.tsx');
  const content = fs.readFileSync(contextPath, 'utf-8');

  assert.strictEqual(
    content.includes("useState<BackendHealthStatus>('loading')"),
    true,
    'Initial health state must be loading'
  );
  assert.strictEqual(
    content.includes('controller.abort'),
    true,
    'Health check must include request timeout'
  );
});

// ==============================================================================
// 3. DEMO MODE REMOVAL FROM DEFAULT RESEARCH EXPERIENCE
// ==============================================================================

test('TopNav.tsx does not render Demo: ON/OFF toggle button', () => {
  const topNavPath = path.resolve(__dirname, '../components/layout/TopNav.tsx');
  const content = fs.readFileSync(topNavPath, 'utf-8');

  assert.strictEqual(
    content.includes('>Demo:<'),
    false,
    'TopNav must not contain Demo toggle button'
  );
  assert.strictEqual(
    content.includes('onToggleDemoMode'),
    false,
    'TopNav JSX must not contain onToggleDemoMode handler'
  );
});

test('Sidebar.tsx does not render Demo Mode Active banner', () => {
  const sidebarPath = path.resolve(__dirname, '../components/layout/Sidebar.tsx');
  const content = fs.readFileSync(sidebarPath, 'utf-8');

  assert.strictEqual(
    content.includes('Demo Mode Active'),
    false,
    'Sidebar must not contain Demo Mode Active banner'
  );
});

test('SettingsPage.tsx does not render demo DisclaimerBanner', () => {
  const settingsPath = path.resolve(__dirname, '../pages/SettingsPage.tsx');
  const content = fs.readFileSync(settingsPath, 'utf-8');

  assert.strictEqual(
    content.includes('type="demo"'),
    false,
    'SettingsPage must not render demo DisclaimerBanner'
  );
});

// ==============================================================================
// 4. WORKSPACE COUNTS INTEGRITY & ACTIVE WORKSPACE SCOPING
// ==============================================================================

test('WorkspaceContext.tsx strictly scopes all counts to the active workspace', () => {
  const wsPath = path.resolve(__dirname, '../contexts/WorkspaceContext.tsx');
  const content = fs.readFileSync(wsPath, 'utf-8');

  // Datasets strictly filtered by workspace_id
  assert.strictEqual(
    content.includes(".from('datasets')\n        .select('id', { count: 'exact', head: true })\n        .eq('workspace_id', wsId)"),
    true,
    'Datasets query must filter by workspace_id = wsId'
  );

  // Model runs strictly filtered by datasets.workspace_id via inner join
  assert.strictEqual(
    content.includes(".from('model_runs')\n        .select('id, datasets!inner(workspace_id)', { count: 'exact', head: true })\n        .eq('datasets.workspace_id', wsId)"),
    true,
    'Model runs query must filter by datasets.workspace_id'
  );

  // Federated rounds strictly filtered by active workspace
  assert.strictEqual(
    content.includes(".from('federated_rounds')\n        .select('id, datasets!inner(workspace_id)', { count: 'exact', head: true })\n        .eq('datasets.workspace_id', wsId)"),
    true,
    'Federated rounds query must filter by active workspace'
  );

  // Fallback counting all datasets without workspace_id must not exist
  assert.strictEqual(
    content.includes('fallbackDs'),
    false,
    'Must not fall back to unscoped datasets query'
  );
});

test('SettingsPage.tsx renders loading state for workspace counts and handles errors', () => {
  const settingsPath = path.resolve(__dirname, '../pages/SettingsPage.tsx');
  const content = fs.readFileSync(settingsPath, 'utf-8');

  assert.strictEqual(
    content.includes('isLoadingWorkspace'),
    true,
    'SettingsPage must handle isLoadingWorkspace'
  );
  assert.strictEqual(
    content.includes('Loading workspace counts...'),
    true,
    'SettingsPage must render loading placeholder for counts'
  );
  assert.strictEqual(
    content.includes('workspaceError'),
    true,
    'SettingsPage must display workspaceError when present'
  );
  assert.strictEqual(
    content.includes('refreshCounts'),
    true,
    'SettingsPage must provide ability to refresh counts'
  );
});
