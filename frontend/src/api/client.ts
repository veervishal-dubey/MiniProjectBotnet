import { storage } from '@/lib/storage';
import { BackendStatus } from '@/types/settings';
import { Dataset } from '@/types/dataset';
import { ModelItem } from '@/types/model';
import { FLExperiment } from '@/types/federated';
import { NetworkFlowRecord } from '@/types/detection';
import { EvaluationExperiment } from '@/types/evaluation';
import { DEMO_DATASETS, DEMO_MODELS, DEMO_FL_EXPERIMENT, DEMO_FLOW_RECORDS, DEMO_EVALUATION_EXPERIMENTS } from './mockData';

export class ApiClient {
  private get baseUrl(): string {
    return storage.getSettings().backendApiUrl || 'http://localhost:8000';
  }

  /**
   * Health check to detect if local FastAPI server is online.
   */
  async checkBackendHealth(): Promise<BackendStatus> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          connected: true,
          service: 'FastAPI Backend',
          version: data.version || '1.0.0',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
        };
      } else {
        return {
          connected: false,
          service: 'FastAPI Backend',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
    } catch {
      return {
        connected: false,
        service: 'FastAPI Backend',
        lastChecked: new Date().toISOString(),
        error: 'Connection refused (server offline or unreachable)',
      };
    }
  }

  async getDatasets(): Promise<{ data: Dataset[]; isBackend: boolean }> {
    const settings = storage.getSettings();
    return {
      data: storage.getDatasets(settings.useDemoData),
      isBackend: false,
    };
  }

  async getModels(): Promise<{ data: ModelItem[]; isBackend: boolean }> {
    const settings = storage.getSettings();
    return {
      data: storage.getModels(settings.useDemoData),
      isBackend: false,
    };
  }

  async getActiveExperiment(): Promise<{ data: FLExperiment; isBackend: boolean }> {
    return {
      data: storage.getActiveExperiment(),
      isBackend: false,
    };
  }

  async getEvaluationExperiments(): Promise<{ data: EvaluationExperiment[]; isBackend: boolean }> {
    return {
      data: DEMO_EVALUATION_EXPERIMENTS,
      isBackend: false,
    };
  }

  async getDetectionFlows(): Promise<{ data: NetworkFlowRecord[]; isBackend: boolean }> {
    return {
      data: DEMO_FLOW_RECORDS,
      isBackend: false,
    };
  }
}

export const apiClient = new ApiClient();
