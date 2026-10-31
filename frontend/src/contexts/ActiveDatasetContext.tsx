import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Dataset } from '@/types/dataset';
import { BatchClassificationResult } from '@/types/detection';
import { storage } from '@/lib/storage';
import { fetchWorkspaceDatasets, downloadDatasetBlob } from '@/lib/datasetService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { apiClient } from '@/api/client';

interface ActiveDatasetContextType {
  activeDataset: Dataset | null;
  activeDatasetId: string | null;
  activePredictions: BatchClassificationResult | null;
  setActivePredictions: (predictions: BatchClassificationResult | null) => void;
  isClassifyingActive: boolean;
  classifyActiveDataset: (modelId?: string) => Promise<BatchClassificationResult>;
  selectDatasetForAnalysis: (dataset: Dataset | null) => void;
  clearActiveDataset: () => void;
  isDatasetActive: (datasetId: string) => boolean;
  refreshActiveDataset: () => Promise<void>;
  isLoadingActiveDataset: boolean;
}

const ACTIVE_DATASET_STORAGE_KEY = 'sentinelfl_active_dataset_id';

const ActiveDatasetContext = createContext<ActiveDatasetContextType | undefined>(undefined);

export const ActiveDatasetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { workspace } = useWorkspace();
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_DATASET_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);
  const [activePredictions, setActivePredictionsState] = useState<BatchClassificationResult | null>(null);
  const [isClassifyingActive, setIsClassifyingActive] = useState<boolean>(false);
  const [isLoadingActiveDataset, setIsLoadingActiveDataset] = useState<boolean>(false);

  // Helper to safely set predictions and persist in session storage
  const setActivePredictions = useCallback((predictions: BatchClassificationResult | null) => {
    setActivePredictionsState(predictions);
    if (activeDatasetId && predictions) {
      try {
        sessionStorage.setItem(`sentinelfl_active_predictions_${activeDatasetId}`, JSON.stringify(predictions));
      } catch (err) {
        console.warn('Could not cache active predictions in sessionStorage:', err);
      }
    } else if (activeDatasetId && !predictions) {
      try {
        sessionStorage.removeItem(`sentinelfl_active_predictions_${activeDatasetId}`);
      } catch (err) {
        console.warn('Could not remove cached predictions from sessionStorage:', err);
      }
    }
  }, [activeDatasetId]);

  // Load predictions from sessionStorage or backend for the active dataset
  const loadPredictionsForDataset = useCallback(async (datasetId: string) => {
    // 1. Try sessionStorage first
    try {
      const cachedStr = sessionStorage.getItem(`sentinelfl_active_predictions_${datasetId}`);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        setActivePredictionsState(parsed);
        return;
      }
    } catch (e) {
      console.debug('No valid sessionStorage predictions:', e);
    }

    // 2. Try fetching from backend
    try {
      const backendCached = await apiClient.getDatasetPredictions(datasetId);
      if (backendCached) {
        setActivePredictionsState(backendCached);
        try {
          sessionStorage.setItem(`sentinelfl_active_predictions_${datasetId}`, JSON.stringify(backendCached));
        } catch {}
      }
    } catch (err) {
      console.debug('No backend cached predictions for dataset:', err);
    }
  }, []);

  const resolveActiveDataset = useCallback(async (id: string | null) => {
    if (!id) {
      setActiveDataset(null);
      setActivePredictionsState(null);
      return;
    }

    setIsLoadingActiveDataset(true);
    try {
      // 1. Check local session storage first for immediate access
      const localList = storage.getDatasets(false);
      const localMatch = localList.find(d => d.id === id);
      if (localMatch) {
        setActiveDataset(localMatch);
        setIsLoadingActiveDataset(false);
        loadPredictionsForDataset(id);
        return;
      }

      // 2. Fetch from Supabase workspace datasets if workspace is present
      if (workspace?.id) {
        try {
          const remoteList = await fetchWorkspaceDatasets(workspace.id);
          const remoteMatch = remoteList.find(d => d.id === id);
          if (remoteMatch) {
            setActiveDataset(remoteMatch);
            setIsLoadingActiveDataset(false);
            loadPredictionsForDataset(id);
            return;
          }
        } catch (fetchErr) {
          console.warn('Could not fetch workspace datasets to resolve active dataset:', fetchErr);
        }
      }

      // 3. Fallback: if id exists but cannot be found in current workspace, clear selection
      setActiveDataset(null);
      setActivePredictionsState(null);
    } catch (err) {
      console.warn('Error resolving active dataset:', err);
      setActiveDataset(null);
      setActivePredictionsState(null);
    } finally {
      setIsLoadingActiveDataset(false);
    }
  }, [workspace?.id, loadPredictionsForDataset]);

  useEffect(() => {
    resolveActiveDataset(activeDatasetId);
  }, [activeDatasetId, resolveActiveDataset]);

  // Centralized classification executor available to all pages
  const classifyActiveDataset = useCallback(async (modelId?: string): Promise<BatchClassificationResult> => {
    if (!activeDataset) {
      throw new Error('No active dataset is selected.');
    }

    setIsClassifyingActive(true);
    try {
      // Try backend direct classification
      try {
        const res = await apiClient.classifyDataset(activeDataset.id, modelId);
        setActivePredictions(res);
        return res;
      } catch (directErr) {
        console.warn('Backend direct classify-dataset fell back to storage blob download:', directErr);
      }

      // Fallback: download full storage blob and post via predictCsv
      if (activeDataset.storagePath) {
        const blob = await downloadDatasetBlob(activeDataset.storagePath);
        const file = new File([blob], activeDataset.filename || `${activeDataset.name}.csv`, {
          type: 'text/csv',
        });
        const res = await apiClient.predictCsv(file, modelId);
        setActivePredictions(res);
        return res;
      } else {
        throw new Error('Dataset storage path unavailable for inference.');
      }
    } finally {
      setIsClassifyingActive(false);
    }
  }, [activeDataset, setActivePredictions]);

  const selectDatasetForAnalysis = useCallback((dataset: Dataset | null) => {
    if (dataset) {
      setActiveDatasetId(dataset.id);
      setActiveDataset(dataset);
      try {
        localStorage.setItem(ACTIVE_DATASET_STORAGE_KEY, dataset.id);
      } catch (e) {
        console.warn('Failed to persist active dataset ID:', e);
      }
      loadPredictionsForDataset(dataset.id);
    } else {
      setActiveDatasetId(null);
      setActiveDataset(null);
      setActivePredictionsState(null);
      try {
        localStorage.removeItem(ACTIVE_DATASET_STORAGE_KEY);
      } catch (e) {
        console.warn('Failed to clear active dataset ID:', e);
      }
    }
  }, [loadPredictionsForDataset]);

  const clearActiveDataset = useCallback(() => {
    selectDatasetForAnalysis(null);
  }, [selectDatasetForAnalysis]);

  const isDatasetActive = useCallback((datasetId: string) => {
    return activeDatasetId === datasetId;
  }, [activeDatasetId]);

  const refreshActiveDataset = useCallback(async () => {
    await resolveActiveDataset(activeDatasetId);
  }, [activeDatasetId, resolveActiveDataset]);

  return (
    <ActiveDatasetContext.Provider
      value={{
        activeDataset,
        activeDatasetId,
        activePredictions,
        setActivePredictions,
        isClassifyingActive,
        classifyActiveDataset,
        selectDatasetForAnalysis,
        clearActiveDataset,
        isDatasetActive,
        refreshActiveDataset,
        isLoadingActiveDataset,
      }}
    >
      {children}
    </ActiveDatasetContext.Provider>
  );
};

export const useActiveDataset = (): ActiveDatasetContextType => {
  const context = useContext(ActiveDatasetContext);
  if (!context) {
    throw new Error('useActiveDataset must be used within an ActiveDatasetProvider');
  }
  return context;
};
