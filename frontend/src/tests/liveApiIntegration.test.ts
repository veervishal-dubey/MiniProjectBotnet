import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:8000';
const SAMPLES_DIR = path.resolve(__dirname, '../../../ml/data/samples');

test('Backend Health check responds with operational status', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'healthy');
  assert.strictEqual(data.readiness.model_artifacts, true);
  assert.strictEqual(data.readiness.inference_service, true);
  assert.strictEqual(data.ml_inference.status, 'healthy');
  assert.strictEqual(data.ml_inference.features_count, 39);
  assert.strictEqual(data.ml_inference.num_classes, 7);
});

test('Backend Dataset Adapters endpoint returns CIC-IoT-2023, Edge-IIoTset, and N-IoT', async () => {
  const res = await fetch(`${BASE_URL}/api/v1/datasets/adapters`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.adapters || [];
  assert.strictEqual(list.length >= 3, true);
  const adapterNames = list.map((a: any) => a.dataset_type);
  assert.strictEqual(adapterNames.includes('cic_iot_2023'), true);
  assert.strictEqual(adapterNames.includes('edge_iiotset'), true);
  assert.strictEqual(adapterNames.includes('n_iot'), true);
});

test('Single Flow Inference classifies benign traffic vector correctly', async () => {
  const payload = {
    protocol: 'TCP',
    src_ip: '192.168.1.50',
    dst_ip: '192.168.1.1',
    src_port: 54321,
    dst_port: 80,
    flow_duration_ms: 120.0,
    tot_fwd_pkts: 10,
    flags: 'ACK'
  };

  const res = await fetch(`${BASE_URL}/api/v1/models/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.predicted_class, 'Benign');
  assert.strictEqual(data.is_malicious, false);
  assert.strictEqual(typeof data.confidence, 'number');
  assert.strictEqual(data.model_version.includes('mlp'), true);
});

test('Batch CSV Inference successfully processes CIC IoT 2023 sample', async () => {
  const samplePath = path.join(SAMPLES_DIR, 'cic_iot_2023_sample.csv');
  assert.strictEqual(fs.existsSync(samplePath), true);

  const fileBytes = fs.readFileSync(samplePath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBytes], { type: 'text/csv' }), 'cic_iot_2023_sample.csv');

  const res = await fetch(`${BASE_URL}/api/v1/models/predict-csv`, {
    method: 'POST',
    body: formData
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.total_flows, 21);
  assert.strictEqual(data.flows.length, 21);
  assert.strictEqual(typeof data.malicious_count, 'number');
  assert.strictEqual(typeof data.benign_count, 'number');
  assert.strictEqual(data.malicious_count + data.benign_count, 21);
});

test('Batch CSV Inference safely rejects incompatible Edge-IIoTset schema with diagnostic detail', async () => {
  const samplePath = path.join(SAMPLES_DIR, 'edge_iiotset_sample.csv');
  assert.strictEqual(fs.existsSync(samplePath), true);

  const fileBytes = fs.readFileSync(samplePath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBytes], { type: 'text/csv' }), 'edge_iiotset_sample.csv');

  const res = await fetch(`${BASE_URL}/api/v1/models/predict-csv`, {
    method: 'POST',
    body: formData
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.detail.includes('Edge-IIoTset'), true);
  assert.strictEqual(data.detail.includes('FLMLP'), true);
});

test('Batch CSV Inference safely rejects incompatible N-IoT schema with diagnostic detail', async () => {
  const samplePath = path.join(SAMPLES_DIR, 'n_iot_sample.csv');
  assert.strictEqual(fs.existsSync(samplePath), true);

  const fileBytes = fs.readFileSync(samplePath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBytes], { type: 'text/csv' }), 'n_iot_sample.csv');

  const res = await fetch(`${BASE_URL}/api/v1/models/predict-csv`, {
    method: 'POST',
    body: formData
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.detail.includes('N-IoT'), true);
  assert.strictEqual(data.detail.includes('FLMLP'), true);
});

test('Backend Audit Logs endpoint returns structured events and category totals', async () => {
  const res = await fetch(`${BASE_URL}/api/v1/logs?limit=50`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(Array.isArray(data.logs), true);
  assert.strictEqual(data.total >= 1, true);
  assert.strictEqual(typeof data.categories_count, 'object');
  assert.strictEqual(typeof data.severities_count, 'object');
  const first = data.logs[0];
  assert.strictEqual(typeof first.id, 'string');
  assert.strictEqual(typeof first.message, 'string');
  assert.strictEqual(typeof first.category, 'string');
});

test('Backend System Summary endpoint returns verified capabilities and counts', async () => {
  const res = await fetch(`${BASE_URL}/api/v1/system/summary`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'operational');
  assert.strictEqual(data.capabilities.ml_inference.status, 'operational');
  assert.strictEqual(data.capabilities.ml_inference.features_count, 39);
  assert.strictEqual(data.capabilities.ml_inference.num_classes, 7);
  assert.strictEqual(data.capabilities.federated_learning.status, 'operational');
  assert.strictEqual(data.capabilities.audit_logging.status, 'operational');
  assert.strictEqual(data.counts.model_count >= 1, true);
});
