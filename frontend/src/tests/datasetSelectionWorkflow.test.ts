import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// 1. DATASET SELECTION CONTEXT & WORKFLOW TESTS
// ==============================================================================

test('ActiveDatasetContext.tsx exists and defines active dataset selection workflow', () => {
  const filePath = path.resolve(__dirname, '../contexts/ActiveDatasetContext.tsx');
  assert.strictEqual(fs.existsSync(filePath), true, 'ActiveDatasetContext.tsx must exist');

  const content = fs.readFileSync(filePath, 'utf-8');
  assert.strictEqual(content.includes('ActiveDatasetProvider'), true);
  assert.strictEqual(content.includes('useActiveDataset'), true);
  assert.strictEqual(content.includes('selectDatasetForAnalysis'), true);
  assert.strictEqual(content.includes('clearActiveDataset'), true);
  assert.strictEqual(content.includes('sentinelfl_active_dataset_id'), true);
});

test('App.tsx embeds ActiveDatasetProvider inside WorkspaceProvider', () => {
  const filePath = path.resolve(__dirname, '../App.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(content.includes('ActiveDatasetProvider'), true);
  assert.strictEqual(content.includes('<ActiveDatasetProvider>'), true);
});

test('DatasetsPage.tsx provides explicit "Select for Analysis" action and "ACTIVE FOR ANALYSIS" badge', () => {
  const filePath = path.resolve(__dirname, '../pages/DatasetsPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(content.includes('useActiveDataset'), true);
  assert.strictEqual(content.includes('Select for Analysis'), true);
  assert.strictEqual(content.includes('ACTIVE FOR ANALYSIS'), true);
  assert.strictEqual(content.includes('Database Record ID:'), true);
});

test('DatasetsPage.tsx clears active dataset selection if deleted dataset was active', () => {
  const filePath = path.resolve(__dirname, '../pages/DatasetsPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(
    content.includes('clearActiveDataset()'),
    true,
    'DatasetsPage must clear active selection upon deletion'
  );
});

test('DashboardPage.tsx Threat Distribution displays source identifier, record count, and active selection', () => {
  const filePath = path.resolve(__dirname, '../pages/DashboardPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(content.includes('useActiveDataset'), true);
  assert.strictEqual(content.includes('Total Records Represented'), true);
  assert.strictEqual(content.includes('Dataset Identifier'), true);
  assert.strictEqual(content.includes('Saved FL Experiment'), true);
});

test('PreprocessingPage.tsx defaults to active dataset and offers "Save Preprocessing Configuration"', () => {
  const filePath = path.resolve(__dirname, '../pages/PreprocessingPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(content.includes('useActiveDataset'), true);
  assert.strictEqual(content.includes('activeDatasetId'), true);
  assert.strictEqual(content.includes('Save Preprocessing Configuration'), true);
  assert.strictEqual(
    content.includes('Stage Parameter Artifact Locally'),
    false,
    'Must not have misleading Stage Parameter Artifact Locally label'
  );
});

test('DetectionPage.tsx integrates active dataset for batch inference', () => {
  const filePath = path.resolve(__dirname, '../pages/DetectionPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(content.includes('useActiveDataset'), true);
  assert.strictEqual(content.includes('handlePredictActiveDataset'), true);
  assert.strictEqual(content.includes('Classify Active Dataset'), true);
});

test('ModelsPage.tsx features "Run Inference" button and honest ML capability communication', () => {
  const filePath = path.resolve(__dirname, '../pages/ModelsPage.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.strictEqual(content.includes('Run Inference'), true);
  assert.strictEqual(content.includes('/detection?model='), true);
  assert.strictEqual(content.includes('Centralized PyTorch MLP (Operational)'), true);
  assert.strictEqual(content.includes('Online Baselines Retraining (Disabled in Web UI)'), true);
});
