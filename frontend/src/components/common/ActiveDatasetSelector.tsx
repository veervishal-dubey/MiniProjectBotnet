import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Database,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  ExternalLink,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useActiveDataset } from '@/contexts/ActiveDatasetContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { fetchWorkspaceDatasets } from '@/lib/datasetService';
import { storage } from '@/lib/storage';
import { Dataset } from '@/types/dataset';

interface ActiveDatasetSelectorProps {
  compact?: boolean;
  onDatasetChanged?: (dataset: Dataset | null) => void;
  className?: string;
}

export const ActiveDatasetSelector: React.FC<ActiveDatasetSelectorProps> = ({
  compact = false,
  onDatasetChanged,
  className = '',
}) => {
  const { workspace } = useWorkspace();
  const {
    activeDataset,
    activeDatasetId,
    selectDatasetForAnalysis,
    clearActiveDataset,
    isLoadingActiveDataset,
  } = useActiveDataset();

  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [isChanging, setIsChanging] = useState<boolean>(false);

  const loadDatasets = useCallback(async () => {
    setIsLoadingList(true);
    try {
      if (workspace?.id) {
        const remote = await fetchWorkspaceDatasets(workspace.id);
        const local = storage.getDatasets(false);
        const merged = new Map<string, Dataset>();
        remote.forEach(d => merged.set(d.id, d));
        local.forEach(d => {
          if (!merged.has(d.id)) merged.set(d.id, d);
        });
        const list = Array.from(merged.values());
        setAvailableDatasets(list);

        // If an active dataset ID exists but is not found in the workspace, clear it
        if (activeDatasetId && !list.some(d => d.id === activeDatasetId)) {
          console.warn(`Active dataset ${activeDatasetId} not found in workspace; resetting selection.`);
          clearActiveDataset();
        }
      } else {
        const local = storage.getDatasets(false);
        setAvailableDatasets(local);
      }
    } catch (err) {
      console.warn('Failed to fetch workspace datasets for selector:', err);
      const cached = storage.getDatasets(false);
      setAvailableDatasets(cached);
    } finally {
      setIsLoadingList(false);
    }
  }, [workspace?.id, activeDatasetId, clearActiveDataset]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      clearActiveDataset();
      onDatasetChanged?.(null);
      setIsChanging(false);
      return;
    }
    const match = availableDatasets.find(d => d.id === selectedId) || null;
    selectDatasetForAnalysis(match);
    onDatasetChanged?.(match);
    setIsChanging(false);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ready':
      case 'preprocessed':
        return (
          <Badge variant="forest" size="sm" dot>
            Preprocessing Completed
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="neutral" size="sm" dot>
            Processing...
          </Badge>
        );
      case 'validated':
        return (
          <Badge variant="sage" size="sm" dot>
            Validated (Ready for Preprocessing)
          </Badge>
        );
      case 'error':
      case 'failed':
        return (
          <Badge variant="red" size="sm" dot>
            Validation Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="neutral" size="sm">
            Uploaded
          </Badge>
        );
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {activeDataset ? (
        <Card className="border-forest-200 bg-surface shadow-subtle p-3.5 sm:p-4 transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2.5 rounded-lg bg-forest-50 text-forest-700 border border-forest-100 flex-shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider font-mono">
                    Active Dataset
                  </span>
                  {getStatusBadge(activeDataset.status)}
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-charcoal-100 text-charcoal-600 cursor-help"
                    title={`Unique Dataset ID: ${activeDataset.id}`}
                  >
                    ID: {activeDataset.id.slice(0, 8)}...
                  </span>
                </div>
                <h4 className="text-sm sm:text-base font-bold text-charcoal-900 truncate mt-0.5 font-sans">
                  {activeDataset.name}
                </h4>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal-500 font-mono mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-charcoal-400" />
                    {new Date(activeDataset.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-charcoal-400" />
                    {(activeDataset.rowCount || 0).toLocaleString()} records
                  </span>
                  <span>
                    {(activeDataset.columnCount || 39)} features
                  </span>
                  {activeDataset.labelColumn && (
                    <span className="text-charcoal-400">
                      Label: <strong className="text-charcoal-700">{activeDataset.labelColumn}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end lg:self-center flex-shrink-0">
              {isChanging ? (
                <div className="flex items-center gap-2">
                  <select
                    value={activeDataset.id}
                    onChange={handleSelect}
                    className="text-xs font-semibold text-charcoal-900 bg-surface border border-forest-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-forest-700 shadow-sm"
                  >
                    {availableDatasets.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({new Date(d.createdAt).toLocaleDateString()} • {(d.rowCount || 0).toLocaleString()} rows)
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsChanging(false)}
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsChanging(true)}
                    className="text-xs text-charcoal-700"
                    title="Switch to another workspace dataset"
                  >
                    Switch Dataset
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      clearActiveDataset();
                      onDatasetChanged?.(null);
                    }}
                    className="text-xs text-charcoal-400 hover:text-charcoal-700"
                    title="Clear active dataset selection"
                  >
                    Clear
                  </Button>
                  <Link to="/datasets">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-charcoal-500 hover:text-charcoal-800"
                      title="Manage all datasets in workspace"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-warmAmber-300 bg-warmAmber-50/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warmAmber-100 text-warmAmber-800 flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-charcoal-900">
                  No Active Dataset Selected
                </h4>
                <p className="text-xs text-charcoal-600 mt-0.5">
                  Select a dataset from this workspace to perform preprocessing, flow detection, or evaluation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {availableDatasets.length > 0 ? (
                <select
                  value=""
                  onChange={handleSelect}
                  className="text-xs font-semibold text-charcoal-900 bg-surface border border-warmAmber-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-forest-700 shadow-sm"
                >
                  <option value="">-- Choose Workspace Dataset ({availableDatasets.length}) --</option>
                  {availableDatasets.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({new Date(d.createdAt).toLocaleDateString()} • {(d.rowCount || 0).toLocaleString()} rows)
                    </option>
                  ))}
                </select>
              ) : null}
              <Link to="/datasets">
                <Button size="sm" variant="primary" className="text-xs">
                  Upload / Manage Datasets
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
