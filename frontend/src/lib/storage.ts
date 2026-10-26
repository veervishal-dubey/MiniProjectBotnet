import { Dataset } from '@/types/dataset';
import { PreprocessingJob } from '@/types/preprocessing';
import { ModelItem } from '@/types/model';
import { FLExperiment } from '@/types/federated';
import { PlatformSettings } from '@/types/settings';
import { LogEntry } from '@/types/logs';
import { DEMO_DATASETS, DEMO_MODELS, DEMO_FL_EXPERIMENT, DEMO_LOGS } from '@/api/mockData';

const SETTINGS_KEY = 'sentinelfl_settings';
const CUSTOM_DATASETS_KEY = 'sentinelfl_custom_datasets';
const PREPROCESSING_JOBS_KEY = 'sentinelfl_preprocessing_jobs';
const CUSTOM_MODELS_KEY = 'sentinelfl_custom_models';
const FL_EXPERIMENT_KEY = 'sentinelfl_active_experiment';
const SYSTEM_LOGS_KEY = 'sentinelfl_system_logs';

export const DEFAULT_SETTINGS: PlatformSettings = {
  researchDefaults: {
    randomSeed: 42,
    trainRatio: 0.70,
    valRatio: 0.15,
    testRatio: 0.15,
    defaultClients: 3,
    defaultRounds: 15,
    defaultLocalEpochs: 3,
    defaultDirichletAlpha: 0.5,
    defaultBatchSize: 64,
    defaultLearningRate: 0.01,
    imbalanceHandling: 'class_weight',
  },
  backendApiUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:8000',
  supabaseUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '',
  supabaseAnonKey: '',
  useDemoData: false,
  themePreference: 'light-stone',
  anonymousAnalytics: false,
  saveLocalCache: true,
};

export const storage = {
  getSettings(): PlatformSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to parse settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: PlatformSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  },

  getDatasets(includeDemo = true): Dataset[] {
    let custom: Dataset[] = [];
    try {
      const saved = localStorage.getItem(CUSTOM_DATASETS_KEY);
      if (saved) custom = JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load custom datasets', e);
    }
    return includeDemo ? [...custom, ...DEMO_DATASETS] : custom;
  },

  saveCustomDataset(dataset: Dataset): void {
    try {
      const existing = this.getDatasets(false);
      const updated = [dataset, ...existing.filter(d => d.id !== dataset.id)];
      localStorage.setItem(CUSTOM_DATASETS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save custom dataset', e);
    }
  },

  deleteCustomDataset(id: string): void {
    try {
      const existing = this.getDatasets(false);
      const filtered = existing.filter(d => d.id !== id);
      localStorage.setItem(CUSTOM_DATASETS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to delete dataset', e);
    }
  },

  getPreprocessingJobs(): PreprocessingJob[] {
    try {
      const saved = localStorage.getItem(PREPROCESSING_JOBS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load preprocessing jobs', e);
    }
    return [];
  },

  savePreprocessingJob(job: PreprocessingJob): void {
    try {
      const existing = this.getPreprocessingJobs();
      const updated = [job, ...existing.filter(j => j.id !== job.id)];
      localStorage.setItem(PREPROCESSING_JOBS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save preprocessing job', e);
    }
  },

  getModels(includeDemo = true): ModelItem[] {
    let custom: ModelItem[] = [];
    try {
      const saved = localStorage.getItem(CUSTOM_MODELS_KEY);
      if (saved) custom = JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load custom models', e);
    }
    return includeDemo ? [...custom, ...DEMO_MODELS] : custom;
  },

  saveCustomModel(model: ModelItem): void {
    try {
      const existing = this.getModels(false);
      const updated = [model, ...existing.filter(m => m.id !== model.id)];
      localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save model', e);
    }
  },

  getActiveExperiment(): FLExperiment {
    try {
      const saved = localStorage.getItem(FL_EXPERIMENT_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load active experiment', e);
    }
    return DEMO_FL_EXPERIMENT;
  },

  saveActiveExperiment(exp: FLExperiment): void {
    try {
      localStorage.setItem(FL_EXPERIMENT_KEY, JSON.stringify(exp));
    } catch (e) {
      console.warn('Failed to save experiment', e);
    }
  },

  getLogs(includeDemo = true): LogEntry[] {
    let localLogs: LogEntry[] = [];
    try {
      const saved = localStorage.getItem(SYSTEM_LOGS_KEY);
      if (saved) localLogs = JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load logs', e);
    }
    return includeDemo ? [...localLogs, ...DEMO_LOGS] : localLogs;
  },

  addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
    try {
      const newEntry: LogEntry = {
        ...entry,
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
      };
      const existing = this.getLogs(false);
      const updated = [newEntry, ...existing].slice(0, 500); // keep max 500
      localStorage.setItem(SYSTEM_LOGS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to add log', e);
    }
  },
};
