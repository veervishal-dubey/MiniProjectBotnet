import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapDatabaseRowToModel, fetchWorkspaceModelRuns } from '../lib/modelService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// 1. MISSING WORKSPACE ID HANDLING
// ==============================================================================

test('fetchWorkspaceModelRuns returns empty array immediately when workspaceId is missing or empty', async () => {
  assert.deepStrictEqual(await fetchWorkspaceModelRuns(undefined), []);
  assert.deepStrictEqual(await fetchWorkspaceModelRuns(''), []);
  assert.deepStrictEqual(await fetchWorkspaceModelRuns('   '), []);
  assert.deepStrictEqual(await fetchWorkspaceModelRuns(null as any), []);
});

// ==============================================================================
// 2. MISSING METRICS & ZERO SYNTHETIC METRIC GUARANTEE
// ==============================================================================

test('mapDatabaseRowToModel never invents synthetic metrics when metrics are missing or empty', () => {
  const stagedRow = {
    id: 'run-1',
    model_name: 'RF-Staged-Test',
    status: 'staged',
    dataset_id: 'ds-100',
    datasets: { id: 'ds-100', name: 'IoT_Traffic', workspace_id: 'ws-alpha' },
    metrics: {},
  };

  const model = mapDatabaseRowToModel(stagedRow);
  assert.strictEqual(model.status, 'staged');
  assert.strictEqual(model.metrics.accuracy, undefined);
  assert.strictEqual(model.metrics.precision, undefined);
  assert.strictEqual(model.metrics.recall, undefined);
  assert.strictEqual(model.metrics.f1Score, undefined);
  assert.strictEqual(model.metrics.f1_score, undefined);
  assert.strictEqual(model.metrics.loss, undefined);
  assert.strictEqual(model.metrics.inferenceLatencyMs, undefined);
  assert.strictEqual(model.metrics.inference_latency_ms, undefined);
  assert.strictEqual(model.metrics.trainingTimeSec, undefined);
  assert.strictEqual(model.metrics.training_time_sec, undefined);
});

test('mapDatabaseRowToModel sanitizes corrupt or non-numeric metrics to undefined', () => {
  const corruptRow = {
    id: 'run-corrupt',
    model_name: 'RF-Corrupt',
    status: 'completed',
    dataset_id: 'ds-100',
    datasets: { id: 'ds-100', name: 'IoT_Traffic', workspace_id: 'ws-alpha' },
    metrics: {
      accuracy: '0.97', // string
      precision: true, // boolean
      recall: null, // null
      f1_score: 0.965, // valid float
      loss: [0.05], // array
      inference_latency_ms: 3.8, // valid float
      training_time_sec: '45s', // string with unit
    },
  };

  const model = mapDatabaseRowToModel(corruptRow);
  assert.strictEqual(model.metrics.accuracy, undefined);
  assert.strictEqual(model.metrics.precision, undefined);
  assert.strictEqual(model.metrics.recall, undefined);
  assert.strictEqual(model.metrics.f1Score, 0.965);
  assert.strictEqual(model.metrics.f1_score, 0.965);
  assert.strictEqual(model.metrics.loss, undefined);
  assert.strictEqual(model.metrics.inferenceLatencyMs, 3.8);
  assert.strictEqual(model.metrics.inference_latency_ms, 3.8);
  assert.strictEqual(model.metrics.trainingTimeSec, undefined);
  assert.strictEqual(model.metrics.training_time_sec, undefined);
});

test('mapDatabaseRowToModel supports both snake_case and camelCase metric accessors', () => {
  const completedRow = {
    id: 'run-completed',
    model_name: 'RF-Completed',
    status: 'completed',
    dataset_id: 'ds-100',
    datasets: { id: 'ds-100', name: 'IoT_Traffic', workspace_id: 'ws-alpha' },
    metrics: {
      accuracy: 0.981,
      precision: 0.975,
      recall: 0.978,
      f1_score: 0.976,
      loss: 0.042,
      inference_latency_ms: 4.1,
      training_time_sec: 52.0,
    },
  };

  const model = mapDatabaseRowToModel(completedRow);
  assert.strictEqual(model.status, 'trained');
  assert.strictEqual(model.metrics.accuracy, 0.981);
  assert.strictEqual(model.metrics.f1Score, 0.976);
  assert.strictEqual(model.metrics.f1_score, 0.976);
  assert.strictEqual(model.metrics.inferenceLatencyMs, 4.1);
  assert.strictEqual(model.metrics.inference_latency_ms, 4.1);
  assert.strictEqual(model.metrics.trainingTimeSec, 52.0);
  assert.strictEqual(model.metrics.training_time_sec, 52.0);
});

// ==============================================================================
// 3. PERSISTED STATUS INTEGRITY
// ==============================================================================

test('mapDatabaseRowToModel only marks model as trained when persisted status confirms completion', () => {
  assert.strictEqual(mapDatabaseRowToModel({ status: 'staged' }).status, 'staged');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'training' }).status, 'training');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'running' }).status, 'training');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'in_progress' }).status, 'training');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'failed' }).status, 'failed');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'error' }).status, 'failed');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'archived' }).status, 'archived');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'completed' }).status, 'trained');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'trained' }).status, 'trained');
  assert.strictEqual(mapDatabaseRowToModel({ status: 'success' }).status, 'trained');
});

// ==============================================================================
// 4. UNASSIGNED DATASET AND MODEL RUN HANDLING
// ==============================================================================

test('mapDatabaseRowToModel safely handles unassigned or missing datasets', () => {
  const unassignedRow = {
    id: 'run-orphan',
    model_name: 'Orphan-Model',
    status: 'staged',
    dataset_id: null,
    datasets: null,
  };

  const model = mapDatabaseRowToModel(unassignedRow);
  assert.strictEqual(model.datasetUsed, 'Unassigned Dataset');
  assert.strictEqual(model.datasetId, null);
});

// ==============================================================================
// 5. STAGING SAFETY: NO DIRECT DATABASE INSERT
// ==============================================================================

test('modelService.ts contains no insert operations and no createStagedModelRun export', () => {
  const servicePath = path.resolve(__dirname, '../lib/modelService.ts');
  const content = fs.readFileSync(servicePath, 'utf-8');

  assert.strictEqual(content.includes('createStagedModelRun'), false, 'createStagedModelRun must not exist');
  assert.strictEqual(content.includes('.insert('), false, '.insert( must not exist in modelService');
  assert.strictEqual(content.includes('datasets!inner'), true, 'Must use inner join datasets!inner');
  assert.strictEqual(content.includes(".eq('datasets.workspace_id', cleanWsId)"), true, 'Must filter datasets.workspace_id');
});

test('ModelsPage.tsx uses informational modal without direct database insertions', () => {
  const pagePath = path.resolve(__dirname, '../pages/ModelsPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf-8');

  assert.strictEqual(content.includes('setIsTrainModalOpen(true)'), true, 'Stage button must open informational modal');
  assert.strictEqual(content.includes(".from('model_runs').insert"), false, 'ModelsPage must not execute insert queries');
  assert.strictEqual(content.includes('Collaborative ML Development Handoff'), true, 'Handoff explanation must be displayed');
  assert.strictEqual(content.includes('Zero Synthetic Metric Guarantee'), true, 'Zero synthetic guarantee notice must be displayed');
});

// ==============================================================================
// 6. MODEL REGISTRY CLEANUP: DEMO DATA, EMPTY STATE & TABLE COLUMNS
// ==============================================================================

test('DEFAULT_SETTINGS.useDemoData is false by default to ensure clean research platform state', async () => {
  const storagePath = path.resolve(__dirname, '../lib/storage.ts');
  const content = fs.readFileSync(storagePath, 'utf-8');
  assert.strictEqual(content.includes('useDemoData: false,'), true, 'useDemoData must be false by default');
});

test('ModelsPage.tsx renders professional empty state and exactly 8 required table columns', () => {
  const pagePath = path.resolve(__dirname, '../pages/ModelsPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf-8');

  // Professional Empty State
  assert.strictEqual(content.includes('title="No Model Runs Yet"'), true, 'Must have No Model Runs Yet title');
  assert.strictEqual(
    content.includes('No centralized or federated training runs have been recorded for this workspace. Once training is completed and genuine results are saved, they will appear here.'),
    true,
    'Must have genuine platform empty state description'
  );

  // Table Columns (Model, Type, Dataset, Accuracy, F1 Score, Latency, Status, Actions)
  assert.strictEqual(content.includes('>Model<'), true, 'Must have Model column');
  assert.strictEqual(content.includes('>Type<'), true, 'Must have Type column');
  assert.strictEqual(content.includes('>Dataset<'), true, 'Must have Dataset column');
  assert.strictEqual(content.includes('>Accuracy<'), true, 'Must have Accuracy column');
  assert.strictEqual(content.includes('>F1 Score<'), true, 'Must have F1 Score column');
  assert.strictEqual(content.includes('>Latency<'), true, 'Must have Latency column');
  assert.strictEqual(content.includes('>Status<'), true, 'Must have Status column');
  assert.strictEqual(content.includes('>Actions<'), true, 'Must have Actions column');

  // Responsiveness: min-w and horizontal scroll
  assert.strictEqual(content.includes('overflow-x-auto'), true, 'Must enable horizontal scrolling');
  assert.strictEqual(content.includes('min-w-[760px]'), true, 'Table must define minimum readable width');
});

test('TopNav.tsx and client.ts use real FastAPI /health endpoint', () => {
  const topNavPath = path.resolve(__dirname, '../components/layout/TopNav.tsx');
  const topNavContent = fs.readFileSync(topNavPath, 'utf-8');
  assert.strictEqual(topNavContent.includes('useBackendHealth'), true, 'TopNav must consume BackendHealthContext');
  assert.strictEqual(topNavContent.includes('/api/v1/health'), false, 'TopNav must not query non-existent /api/v1/health');

  const healthCtxPath = path.resolve(__dirname, '../contexts/BackendHealthContext.tsx');
  const healthCtxContent = fs.readFileSync(healthCtxPath, 'utf-8');
  assert.strictEqual(healthCtxContent.includes('${cleanUrl}/health`'), true, 'BackendHealthContext must query real /health endpoint');

  const clientPath = path.resolve(__dirname, '../api/client.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf-8');
  assert.strictEqual(clientContent.includes('${this.baseUrl}/health`'), true, 'ApiClient must query real /health endpoint');
});

