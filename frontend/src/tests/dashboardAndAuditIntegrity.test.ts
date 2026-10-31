import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// 1. DASHBOARD OVERVIEW INTEGRITY & DEMO REMOVAL
// ==============================================================================

test('DashboardPage.tsx does not contain DEMO MODE badge or Research Sandbox banner', () => {
  const filePath = path.resolve(__dirname, '../pages/DashboardPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('DEMO MODE'),
    false,
    'DashboardPage must not contain DEMO MODE badge'
  );

  assert.strictEqual(
    content.includes('Research Sandbox:'),
    false,
    'DashboardPage must not contain Research Sandbox banner'
  );

  assert.strictEqual(
    content.includes('type="demo"'),
    false,
    'DashboardPage must not render type="demo"'
  );
});

test('DashboardPage.tsx does not contain fabricated attack distributions or hardcoded metrics', () => {
  const filePath = path.resolve(__dirname, '../pages/DashboardPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('Mirai-UDP_Flood (17.8%)'),
    false,
    'DashboardPage must not have hardcoded Mirai-UDP_Flood (17.8%)'
  );

  assert.strictEqual(
    content.includes('3 Clients Synchronized'),
    false,
    'DashboardPage must not hardcode 3 Clients Synchronized'
  );

  assert.strictEqual(
    content.includes('3 Edge Silos'),
    false,
    'DashboardPage must not hardcode 3 Edge Silos'
  );

  assert.strictEqual(
    content.includes('over 15 communication rounds'),
    false,
    'DashboardPage must not hardcode 15 communication rounds'
  );
});

test('DashboardPage.tsx includes required genuine empty states', () => {
  const filePath = path.resolve(__dirname, '../pages/DashboardPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('No datasets uploaded yet'),
    true,
    'DashboardPage must have honest empty hint for datasets'
  );

  assert.strictEqual(
    content.includes('No preprocessing jobs yet'),
    true,
    'DashboardPage must have honest empty hint for preprocessing jobs'
  );

  assert.strictEqual(
    content.includes('No verified model runs available'),
    true,
    'DashboardPage must have honest empty hint for model runs'
  );

  assert.strictEqual(
    content.includes('No federated training results available'),
    true,
    'DashboardPage must have honest empty hint for federated learning'
  );

  assert.strictEqual(
    content.includes('Upload a dataset and generate predictions to view the threat distribution'),
    true,
    'DashboardPage must have honest empty state for threat distribution'
  );

  assert.strictEqual(
    content.includes('No training history available'),
    true,
    'DashboardPage must have honest empty state for convergence chart'
  );
});

// ==============================================================================
// 2. DISCLAIMER BANNER INTEGRITY
// ==============================================================================

test('DisclaimerBanner.tsx defaults to info and never renders DEMO MODE badge', () => {
  const filePath = path.resolve(__dirname, '../components/ui/DisclaimerBanner.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('DEMO MODE'),
    false,
    'DisclaimerBanner must not contain hardcoded DEMO MODE badge'
  );

  assert.strictEqual(
    content.includes('Research Sandbox:'),
    false,
    'DisclaimerBanner must not contain Research Sandbox:'
  );

  assert.strictEqual(
    content.includes("type = 'info'"),
    true,
    "DisclaimerBanner must default to type = 'info'"
  );
});

// ==============================================================================
// 3. DETECTION & FLOW INTEGRITY
// ==============================================================================

test('DetectionPage.tsx does not load DEMO_FLOW_RECORDS and starts with empty flows', () => {
  const filePath = path.resolve(__dirname, '../pages/DetectionPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('DEMO_FLOW_RECORDS'),
    false,
    'DetectionPage must not import or use DEMO_FLOW_RECORDS'
  );

  assert.strictEqual(
    content.includes('toggle Demonstration Mode'),
    false,
    'DetectionPage must not prompt user to toggle Demonstration Mode'
  );
});

// ==============================================================================
// 4. FEDERATED LEARNING INTEGRITY
// ==============================================================================

test('FederatedPage.tsx dynamically displays clients and rounds without demo prompt', () => {
  const filePath = path.resolve(__dirname, '../pages/FederatedPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('Enable Demonstration Mode'),
    false,
    'FederatedPage must not prompt to Enable Demonstration Mode'
  );

  assert.strictEqual(
    content.includes('/ 3 Clients'),
    false,
    'FederatedPage rounds table must not hardcode / 3 Clients'
  );
});

// ==============================================================================
// 5. DATASETS & PREPROCESSING INTEGRITY
// ==============================================================================

test('DatasetsPage.tsx does not contain Load Benchmark Datasets (Demo) action', () => {
  const filePath = path.resolve(__dirname, '../pages/DatasetsPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('Load Benchmark Datasets (Demo)'),
    false,
    'DatasetsPage must not render Load Benchmark Datasets (Demo)'
  );
});

test('apiClient in client.ts does not fallback to DEMO mock datasets or flows', () => {
  const filePath = path.resolve(__dirname, '../api/client.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('DEMO_FLOW_RECORDS'),
    false,
    'client.ts must not return DEMO_FLOW_RECORDS'
  );
});
