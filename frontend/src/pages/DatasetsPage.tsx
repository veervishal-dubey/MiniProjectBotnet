import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Upload,
  Database,
  FileText,
  Table,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Eye,
  Trash2,
  Info,
  Layers,
  Search,
  RefreshCw,
  Shield,
  ShieldCheck,
  ArrowRight,
  Filter,
  Check,
  X,
  Radio,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { useToast } from '@/components/ui/Toast';
import { storage } from '@/lib/storage';
import { Dataset, IotCompatibilityStatus } from '@/types/dataset';
import { ClassDistributionBar } from '@/components/charts/ClassDistributionBar';
import { parseCsvContent } from '@/lib/csvParser';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActiveDataset } from '@/contexts/ActiveDatasetContext';
import {
  fetchWorkspaceDatasets,
  uploadDatasetToSupabase,
  deleteDatasetFromSupabase,
  validateUploadFile,
  MAX_FILE_SIZE_BYTES,
  STORAGE_BUCKET_NAME,
} from '@/lib/datasetService';
import { validateDatasetApi, ValidationReportDto } from '@/lib/backendApi';
import { Activity, FileCheck, CheckCircle } from 'lucide-react';

export const DatasetsPage: React.FC = () => {
  const { user } = useAuth();
  const { workspace, refreshCounts } = useWorkspace();
  const { activeDatasetId, isDatasetActive, selectDatasetForAnalysis, clearActiveDataset } = useActiveDataset();
  const { success, error, info } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<Dataset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'needs_attention'>('all');
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReportDto | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);

  // Load datasets: fetches live from Supabase public.datasets table for the active workspace
  const loadDatasets = useCallback(async () => {
    setIsLoadingList(true);
    try {
      if (workspace?.id) {
        try {
          const remoteList = await fetchWorkspaceDatasets(workspace.id);
          // Also merge any local session custom datasets if present
          const localList = storage.getDatasets(false);
          const mergedMap = new Map<string, Dataset>();
          remoteList.forEach(d => mergedMap.set(d.id, d));
          localList.forEach(d => {
            if (!mergedMap.has(d.id)) mergedMap.set(d.id, d);
          });

          const combined = Array.from(mergedMap.values());
          setDatasets(combined);
          if (combined.length > 0) {
            setSelectedDataset(prev => (prev ? combined.find(d => d.id === prev.id) || combined[0] : combined[0]));
          } else {
            setSelectedDataset(null);
          }
        } catch (fetchErr: any) {
          console.warn('Remote datasets fetch failed; using cached session datasets:', fetchErr);
          const cached = storage.getDatasets(false);
          setDatasets(cached);
          if (cached.length > 0 && !selectedDataset) {
            setSelectedDataset(cached[0]);
          }
        }
      } else {
        const fallback = storage.getDatasets(false);
        setDatasets(fallback);
      }
    } catch (err: any) {
      console.error('Error loading datasets:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Handle file validation, CSV inspection, Supabase Storage upload, and metadata insertion
  const handleFile = async (file: File) => {
    // 1. Client-side format & size validation
    const validation = validateUploadFile(file);
    if (!validation.valid) {
      error('File Rejected', validation.error || 'Invalid file format or size.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStatusText('Validating file format and checking constraints...');

    try {
      // If user is authenticated and has a workspace, perform real Supabase Storage & DB upload
      if (user?.id && workspace?.id) {
        setUploadStatusText('Inspecting CSV schema & computing IoT feature compatibility...');
        setUploadProgress(30);

        const newDataset = await uploadDatasetToSupabase({
          file,
          workspaceId: workspace.id,
          userId: user.id,
          onProgress: (pct) => {
            setUploadProgress(pct);
            if (pct < 40) setUploadStatusText('Inspecting schema & flow headers...');
            else if (pct < 70) setUploadStatusText(`Uploading to private Supabase Storage (${STORAGE_BUCKET_NAME})...`);
            else if (pct < 95) setUploadStatusText('Writing verified metadata to public.datasets...');
            else setUploadStatusText('Finalizing dataset registration...');
          },
        });

        // Also cache locally for seamless offline/navigation persistence
        storage.saveCustomDataset(newDataset);
        setDatasets(prev => [newDataset, ...prev.filter(d => d.id !== newDataset.id)]);
        setSelectedDataset(newDataset);

        // Update dashboard counters immediately
        await refreshCounts();

        success(
          'Dataset Successfully Uploaded',
          `"${newDataset.name}" saved to private Supabase Storage and registered in workspace "${workspace.name}".`
        );
      } else {
        // Fallback for isolated session when auth is initializing
        setUploadStatusText('Inspecting CSV in local session...');
        setUploadProgress(50);

        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const parsed = parseCsvContent(text, 100);

          const labelCol = parsed.detectedLabelColumn || 'label';
          const classCounts: Record<string, number> = {};
          parsed.rows.forEach(r => {
            const val = String(r[labelCol] ?? 'Unknown');
            classCounts[val] = (classCounts[val] || 0) + 1;
          });

          const classDistribution = Object.entries(classCounts).map(([className, count]) => ({
            className,
            count,
            percentage: +((count / Math.max(parsed.rows.length, 1)) * 100).toFixed(1),
            isMalicious: !className.toLowerCase().includes('benign') && !className.toLowerCase().includes('normal'),
          }));

          const localDataset: Dataset = {
            id: `ds-local-${Date.now()}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            filename: file.name,
            source: 'Local Browser Upload (Uncommitted Preview)',
            sizeBytes: file.size,
            rowCount: parsed.totalRows,
            columnCount: parsed.columns.length,
            labelColumn: labelCol,
            classDistribution,
            status: 'ready',
            createdAt: new Date().toISOString(),
            description: `Locally parsed CSV network traffic capture containing ${parsed.totalRows.toLocaleString()} flow rows and ${parsed.columns.length} columns.`,
            columns: parsed.columns,
            previewRows: parsed.rows,
            isDemoSample: false,
            fileFormat: file.name.endsWith('.txt') ? 'txt' : 'csv',
            iotStatus: parsed.iotStatus,
            iotFeatures: parsed.iotFeatures,
            missingValuesTotal: parsed.missingValuesTotal,
            duplicateCount: parsed.duplicateCount,
          };

          storage.saveCustomDataset(localDataset);
          setDatasets(prev => [localDataset, ...prev]);
          setSelectedDataset(localDataset);
          setUploadProgress(100);
          success('Dataset Parsed in Session', `Inspected ${parsed.columns.length} features across ${parsed.totalRows.toLocaleString()} rows.`);
        };
        reader.readAsText(file.slice(0, 1024 * 1024 * 2));
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      if (err.message?.includes('infinite recursion') || err.message?.includes('workspace_members')) {
        error(
          'Database RLS Policy Error',
          'PostgreSQL detected recursion in workspace_members policies. Please run the SQL migration 03_fix_workspace_members_recursion.sql in Supabase SQL Editor.'
        );
      } else {
        error('Upload Failed', err.message || 'An error occurred while uploading the dataset.');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatusText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Safe deletion with Supabase Storage and database cleanup
  const handleConfirmDelete = async () => {
    if (!datasetToDelete) return;

    setIsDeleting(true);
    try {
      // 1. If it's a remote Supabase dataset, purge from storage and public.datasets
      if (datasetToDelete.storagePath || (!datasetToDelete.isDemoSample && !datasetToDelete.id.startsWith('ds-local-'))) {
        const result = await deleteDatasetFromSupabase(datasetToDelete);
        if (!result.success) {
          throw new Error(result.error);
        }
      }

      // 2. Remove from local storage cache
      storage.deleteCustomDataset(datasetToDelete.id);

      // If active dataset was deleted, clear active analysis selection
      if (datasetToDelete.id === activeDatasetId) {
        clearActiveDataset();
      }

      // 3. Update component state
      setDatasets(prev => prev.filter(d => d.id !== datasetToDelete.id));
      if (selectedDataset?.id === datasetToDelete.id) {
        const remaining = datasets.filter(d => d.id !== datasetToDelete.id);
        setSelectedDataset(remaining[0] || null);
      }

      // 4. Refresh workspace counts
      await refreshCounts();

      success('Dataset Deleted', `Dataset "${datasetToDelete.name}" and associated storage objects have been permanently removed.`);
    } catch (err: any) {
      error('Deletion Error', err.message || 'Failed to delete dataset.');
    } finally {
      setIsDeleting(false);
      setDatasetToDelete(null);
    }
  };

  const handleValidateWithBackend = async () => {
    if (!selectedDataset) return;
    setIsValidating(true);
    try {
      const report = await validateDatasetApi(selectedDataset.id, selectedDataset.labelColumn);
      setValidationReport(report);
      setIsValidationModalOpen(true);
      success(
        'Backend Validation Complete',
        `Verified ${report.total_rows.toLocaleString()} flows across ${report.total_columns} columns via FastAPI.`
      );
    } catch (err: any) {
      console.error('FastAPI validation failed:', err);
      error('Backend Validation Error', err.message || 'Failed to validate dataset on FastAPI backend.');
    } finally {
      setIsValidating(false);
    }
  };

  // Filter datasets by search query and IoT status
  const filteredDatasets = datasets.filter(d => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.source.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'ready') {
      return d.iotStatus === 'ready_for_preprocessing' || d.isDemoSample;
    }
    if (statusFilter === 'needs_attention') {
      return d.iotStatus === 'needs_attention' || d.iotStatus === 'inspection_failed';
    }
    return true;
  });

  const renderIotBadge = (status?: IotCompatibilityStatus, datasetStatus?: string) => {
    if (datasetStatus === 'preprocessed') {
      return (
        <Badge variant="forest" size="sm" dot>
          PREPROCESSING COMPLETED
        </Badge>
      );
    }
    switch (status) {
      case 'ready_for_preprocessing':
        return (
          <Badge variant="forest" size="sm" dot>
            READY FOR PREPROCESSING
          </Badge>
        );
      case 'needs_attention':
        return (
          <Badge variant="amber" size="sm" dot>
            NEEDS ATTENTION
          </Badge>
        );
      case 'inspection_failed':
        return (
          <Badge variant="red" size="sm" dot>
            VALIDATION FAILED
          </Badge>
        );
      default:
        if (datasetStatus === 'ready') {
          return (
            <Badge variant="sage" size="sm" dot>
              VALIDATED
            </Badge>
          );
        }
        return (
          <Badge variant="neutral" size="sm">
            UPLOADED
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="info"
        message={`Datasets are secured with Supabase Row Level Security and isolated inside your workspace: "${workspace?.name || 'Personal Workspace'}". Private storage bucket: ${STORAGE_BUCKET_NAME}.`}
      />

      {/* CSV Drag & Drop Upload Card */}
      <Card
        className={`p-6 transition-colors border-dashed ${
          isDragOver ? 'border-forest-600 bg-forest-50/50' : 'border-border'
        }`}
        onDragOver={e => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-surface border border-border flex items-center justify-center text-forest-800 shadow-subtle flex-shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-semibold text-charcoal-900 tracking-tight">
                  Import Network Flow Dataset (.CSV, .TXT)
                </h3>
                <Badge variant="neutral" size="sm">
                  Max 100 MB
                </Badge>
              </div>
              <p className="text-xs text-charcoal-500 mt-0.5 leading-relaxed">
                Drag and drop network capture files (e.g., CICIoT2023, BoT-IoT, or N-BaIoT extracted features).
                Uploaded files are stored privately in <span className="font-mono text-charcoal-700">{STORAGE_BUCKET_NAME}</span> under authenticated RLS.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <Button
              size="sm"
              variant="primary"
              isLoading={isUploading}
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Upload className="w-3.5 h-3.5" />}
            >
              Select Dataset File
            </Button>
          </div>
        </div>

        {isUploading && (
          <div className="mt-4 pt-3 border-t border-border-subtle">
            <div className="flex justify-between text-xs text-charcoal-600 mb-1 font-mono">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-forest-700" />
                {uploadStatusText || 'Uploading to private storage...'}
              </span>
              <span className="font-semibold text-forest-800">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-surface-subtle h-1.5 rounded overflow-hidden">
              <div
                className="bg-forest-700 h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Datasets Table & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table of datasets */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-charcoal-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search datasets by name or source..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-charcoal-900 focus:outline-none focus:ring-1 focus:ring-forest-700 font-sans"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded border border-border bg-surface text-xs p-0.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    statusFilter === 'all' ? 'bg-forest-800 text-white' : 'text-charcoal-600 hover:text-charcoal-900'
                  }`}
                >
                  All ({datasets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ready')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    statusFilter === 'ready' ? 'bg-forest-800 text-white' : 'text-charcoal-600 hover:text-charcoal-900'
                  }`}
                >
                  Ready
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('needs_attention')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    statusFilter === 'needs_attention' ? 'bg-forest-800 text-white' : 'text-charcoal-600 hover:text-charcoal-900'
                  }`}
                >
                  Needs Attention
                </button>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5"
                isLoading={isLoadingList}
                onClick={loadDatasets}
                title="Refresh dataset list from Supabase"
              >
                <RefreshCw className="w-3.5 h-3.5 text-charcoal-600" />
              </Button>
            </div>
          </div>

          {filteredDatasets.length === 0 ? (
            <EmptyState
              title={datasets.length === 0 ? 'No datasets uploaded yet' : 'No Matching Datasets'}
              description={
                datasets.length === 0
                  ? 'Your workspace has zero uploaded flow records. Drag and drop a network capture (.CSV or .TXT) above to import flow records.'
                  : 'No datasets match your active search or filter criteria. Try clearing the filter.'
              }
              actionLabel={datasets.length === 0 ? 'Select CSV to Upload' : 'Clear Search'}
              onAction={() => {
                if (datasets.length === 0) {
                  fileInputRef.current?.click();
                } else {
                  setSearchQuery('');
                  setStatusFilter('all');
                }
              }}
            />
          ) : (
            <div className="overflow-x-auto border border-border rounded bg-surface shadow-subtle">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans">
                    <th className="py-2.5 px-3">Dataset & Format</th>
                    <th className="py-2.5 px-3">Flows (Rows)</th>
                    <th className="py-2.5 px-3">Features</th>
                    <th className="py-2.5 px-3">Target Label</th>
                    <th className="py-2.5 px-3">IoT Compatibility</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-mono">
                  {filteredDatasets.map(dataset => {
                    const isSelected = selectedDataset?.id === dataset.id;
                    const isActive = isDatasetActive(dataset.id);
                    const format = dataset.fileFormat || (dataset.filename.endsWith('.txt') ? 'TXT' : 'CSV');
                    const sizeMb = (dataset.sizeBytes / 1024 / 1024).toFixed(2);

                    return (
                      <tr
                        key={dataset.id}
                        onClick={() => setSelectedDataset(dataset)}
                        className={`hover:bg-surface-subtle/70 cursor-pointer transition-colors ${
                          isSelected ? 'bg-forest-50/60 font-medium' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-sans">
                          <div className="font-semibold text-charcoal-900 flex items-center gap-2 flex-wrap">
                            <span>{dataset.name}</span>
                            <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                              {format.toUpperCase()}
                            </Badge>
                            {isActive && (
                              <Badge variant="forest" size="sm" dot>
                                ACTIVE FOR ANALYSIS
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-charcoal-500 font-mono">
                            {dataset.filename} • ID: {dataset.id.slice(0, 16)}... • {sizeMb} MB • {new Date(dataset.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-charcoal-800">
                          {dataset.rowCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-charcoal-800">
                          {dataset.columnCount} cols
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="sage" size="sm">
                            {dataset.labelColumn}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 font-sans">
                          {renderIotBadge(dataset.iotStatus)}
                        </td>
                        <td className="py-3 px-3 text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            {isActive ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 text-forest-800 border-forest-300 bg-forest-50 hover:bg-forest-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectDatasetForAnalysis(null);
                                  info('Selection Cleared', 'Active dataset deselected.');
                                }}
                                title="Active dataset for analysis (click to clear)"
                              >
                                <Check className="w-3.5 h-3.5 mr-1 text-forest-700" />
                                Active
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2 text-charcoal-700 hover:text-forest-800 hover:bg-forest-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectDatasetForAnalysis(dataset);
                                  info('Dataset Activated', `"${dataset.name}" selected for analysis across Overview, Preprocessing, and Detection.`);
                                }}
                                title="Select this dataset for analysis"
                              >
                                <Radio className="w-3.5 h-3.5 mr-1" />
                                Select for Analysis
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDataset(dataset);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Inspect
                            </Button>
                            {!dataset.isDemoSample && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2 text-mutedRed-600 hover:text-mutedRed-800 hover:bg-mutedRed-50"
                                onClick={e => {
                                  e.stopPropagation();
                                  setDatasetToDelete(dataset);
                                }}
                                title="Delete dataset from database and storage"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Dataset Detail Sidebar */}
        <div className="space-y-4">
          {selectedDataset ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-charcoal-500 font-mono">SELECTED DATASET</span>
                  <div className="flex items-center gap-1.5">
                    {isDatasetActive(selectedDataset.id) && (
                      <Badge variant="forest" size="sm" dot>
                        ACTIVE
                      </Badge>
                    )}
                    {renderIotBadge(selectedDataset.iotStatus)}
                  </div>
                </div>
                <CardTitle className="mt-1">{selectedDataset.name}</CardTitle>
                <CardDescription>{selectedDataset.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* IoT Feature Checklist */}
                <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-2 text-xs font-sans">
                  <div className="font-semibold text-charcoal-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-forest-800" />
                    <span>IoT Telemetry Feature Analysis</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {selectedDataset.iotFeatures?.hasIpAddresses ? (
                        <Check className="w-3.5 h-3.5 text-forest-700" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-charcoal-400" />
                      )}
                      <span className={selectedDataset.iotFeatures?.hasIpAddresses ? 'text-charcoal-800' : 'text-charcoal-400'}>
                        IP Addresses
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedDataset.iotFeatures?.hasPorts ? (
                        <Check className="w-3.5 h-3.5 text-forest-700" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-charcoal-400" />
                      )}
                      <span className={selectedDataset.iotFeatures?.hasPorts ? 'text-charcoal-800' : 'text-charcoal-400'}>
                        Transport Ports
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedDataset.iotFeatures?.hasProtocol ? (
                        <Check className="w-3.5 h-3.5 text-forest-700" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-charcoal-400" />
                      )}
                      <span className={selectedDataset.iotFeatures?.hasProtocol ? 'text-charcoal-800' : 'text-charcoal-400'}>
                        Network Protocol
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedDataset.iotFeatures?.hasTrafficMetrics ? (
                        <Check className="w-3.5 h-3.5 text-forest-700" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-charcoal-400" />
                      )}
                      <span className={selectedDataset.iotFeatures?.hasTrafficMetrics ? 'text-charcoal-800' : 'text-charcoal-400'}>
                        Flow Metrics
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedDataset.iotFeatures?.hasDuration ? (
                        <Check className="w-3.5 h-3.5 text-forest-700" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-charcoal-400" />
                      )}
                      <span className={selectedDataset.iotFeatures?.hasDuration ? 'text-charcoal-800' : 'text-charcoal-400'}>
                        Flow Duration
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedDataset.iotFeatures?.hasLabel ? (
                        <Check className="w-3.5 h-3.5 text-forest-700" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-charcoal-400" />
                      )}
                      <span className={selectedDataset.iotFeatures?.hasLabel ? 'text-charcoal-800' : 'text-charcoal-400'}>
                        Label / Attack
                      </span>
                    </div>
                  </div>
                </div>

                {/* Class Distribution preview */}
                {selectedDataset.classDistribution && selectedDataset.classDistribution.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-charcoal-800 mb-2 font-sans">
                      Class Distribution Breakdown
                    </h4>
                    <ClassDistributionBar
                      distribution={selectedDataset.classDistribution}
                      horizontal={true}
                    />
                  </div>
                )}

                {/* Metadata list */}
                <div className="pt-3 border-t border-border-subtle space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Database Record ID:</span>
                    <span className="font-semibold text-charcoal-900 font-mono text-[11px] truncate max-w-[170px]" title={selectedDataset.id}>
                      {selectedDataset.id}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Total Records:</span>
                    <span className="font-semibold text-charcoal-900">
                      {selectedDataset.rowCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Features Count:</span>
                    <span className="font-semibold text-charcoal-900">
                      {selectedDataset.columnCount} columns
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Label Attribute:</span>
                    <span className="font-semibold text-forest-800">{selectedDataset.labelColumn}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Missing Values:</span>
                    <span className="text-charcoal-800">
                      {selectedDataset.missingValuesTotal ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Sample Duplicates:</span>
                    <span className="text-charcoal-800">
                      {selectedDataset.duplicateCount ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-charcoal-500 font-sans">Storage Location:</span>
                    <span className="text-charcoal-600 font-sans text-[11px] truncate max-w-[170px]" title={selectedDataset.storagePath || selectedDataset.source}>
                      {selectedDataset.storagePath ? `Supabase: ${selectedDataset.storagePath}` : selectedDataset.source}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex flex-col gap-2 font-sans">
                  {isDatasetActive(selectedDataset.id) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 border-forest-300 bg-forest-50 text-forest-900 hover:bg-forest-100"
                      onClick={() => {
                        selectDatasetForAnalysis(null);
                        info('Selection Cleared', 'Active dataset deselected.');
                      }}
                    >
                      <Check className="w-4 h-4 text-forest-700" />
                      <span>Active for Analysis (Click to Clear)</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full flex items-center justify-center gap-2"
                      onClick={() => {
                        selectDatasetForAnalysis(selectedDataset);
                        info('Dataset Activated', `"${selectedDataset.name}" is now the active dataset for analysis.`);
                      }}
                    >
                      <Radio className="w-4 h-4" />
                      <span>Select for Analysis</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 text-forest-800 border-forest-300 hover:bg-forest-50"
                    isLoading={isValidating}
                    disabled={isValidating}
                    onClick={handleValidateWithBackend}
                  >
                    <ShieldCheck className="w-4 h-4 text-forest-700" />
                    <span>Validate with FastAPI</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={selectedDataset.iotStatus === 'inspection_failed' || selectedDataset.status === 'error'}
                    onClick={() => {
                      selectDatasetForAnalysis(selectedDataset);
                      window.location.assign(`/preprocessing?dataset=${selectedDataset.id}`);
                    }}
                    title={
                      selectedDataset.iotStatus === 'inspection_failed'
                        ? 'Cannot preprocess: Validation failed. Inspect schema issues.'
                        : 'Open in Preprocessing Pipeline'
                    }
                  >
                    Open in Preprocessing Pipeline
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="w-full flex items-center justify-center gap-2"
                    disabled={selectedDataset.status === 'error'}
                    onClick={() => {
                      selectDatasetForAnalysis(selectedDataset);
                      window.location.assign('/detection');
                    }}
                    title="Classify all eligible network flows with trained PyTorch model"
                  >
                    <Activity className="w-4 h-4" />
                    <span>Classify in Flow Detection</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-6 text-center text-xs text-charcoal-400">
              Select a dataset from the list to view schema details, distributions, and compatibility status.
            </Card>
          )}
        </div>
      </div>

      {/* CSV Records Preview Table Drawer / Modal */}
      {selectedDataset && selectedDataset.previewRows && selectedDataset.previewRows.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Table className="w-4 h-4 text-forest-800" />
                <span>Raw Record Preview: {selectedDataset.name}</span>
              </CardTitle>
              <CardDescription>
                First {selectedDataset.previewRows.length} flow samples. Scroll horizontally to inspect extracted attributes. Cell values are safely sanitized.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-charcoal-500">
                {selectedDataset.columns.length} columns detected
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border border-border rounded max-h-72">
              <table className="w-full text-[11px] font-mono text-left divide-y divide-border-subtle">
                <thead className="bg-surface-subtle sticky top-0 z-10">
                  <tr className="text-charcoal-600">
                    <th className="p-2 border-r border-border-subtle bg-surface-subtle">#</th>
                    {selectedDataset.columns.map(col => (
                      <th key={col.name} className="p-2 border-r border-border-subtle whitespace-nowrap">
                        <div className="font-semibold text-charcoal-900">{col.name}</div>
                        <div className="text-[10px] text-charcoal-400 font-normal">{col.dtype}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-surface">
                  {selectedDataset.previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-surface-subtle/50 transition-colors">
                      <td className="p-2 text-charcoal-400 border-r border-border-subtle">{idx + 1}</td>
                      {selectedDataset.columns.map(col => {
                        const val = row[col.name];
                        const isLabel = col.name === selectedDataset.labelColumn;
                        return (
                          <td
                            key={col.name}
                            className={`p-2 border-r border-border-subtle whitespace-nowrap ${
                              isLabel ? 'font-semibold text-forest-800 bg-forest-50/30' : 'text-charcoal-800'
                            }`}
                          >
                            {val !== null && val !== undefined ? String(val) : 'null'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!datasetToDelete}
        onClose={() => {
          if (!isDeleting) setDatasetToDelete(null);
        }}
        title="Confirm Dataset Deletion"
        description="Permanently remove dataset metadata and storage files"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="p-3 rounded bg-mutedRed-50 border border-mutedRed-200 text-mutedRed-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-mutedRed-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="leading-relaxed">
                Deleting <strong className="font-semibold">{datasetToDelete?.name}</strong> will remove the record from <code className="font-mono">public.datasets</code> and purge the file from private Supabase Storage bucket <code className="font-mono">{STORAGE_BUCKET_NAME}</code>.
              </p>
            </div>
          </div>

          <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-charcoal-500">Dataset ID:</span>
              <span className="text-charcoal-800">{datasetToDelete?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal-500">Storage Path:</span>
              <span className="text-charcoal-800 truncate max-w-[200px]">{datasetToDelete?.storagePath || 'Session record'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal-500">File Size:</span>
              <span className="text-charcoal-800">{((datasetToDelete?.sizeBytes || 0) / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setDatasetToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              onClick={handleConfirmDelete}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* FastAPI Validation Report Modal */}
      <Modal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        title={`FastAPI Structural Validation: ${validationReport?.file_name || selectedDataset?.name}`}
        description="Comprehensive CSV format, column, distribution, and compatibility report from backend API."
        maxWidth="xl"
      >
        {validationReport && (
          <div className="space-y-4 text-xs font-sans max-h-[75vh] overflow-y-auto pr-1">
            {/* Status Summary Banner */}
            <div
              className={`p-3.5 rounded border flex items-start gap-3 ${
                validationReport.is_valid
                  ? 'bg-forest-50 border-forest-200 text-forest-900'
                  : 'bg-mutedRed-50 border-mutedRed-200 text-mutedRed-900'
              }`}
            >
              {validationReport.is_valid ? (
                <CheckCircle2 className="w-5 h-5 text-forest-700 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-mutedRed-700 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold text-sm">
                  {validationReport.is_valid ? 'CSV Validation Succeeded' : 'CSV Validation Failed'}
                </div>
                <p className="text-xs opacity-90">
                  {validationReport.error_message ||
                    `Successfully verified file structure: ${validationReport.total_rows.toLocaleString()} flow rows and ${validationReport.total_columns} attributes.`}
                </p>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Verified Rows</div>
                <div className="text-base font-bold text-charcoal-900 mt-0.5">
                  {validationReport.total_rows.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Total Columns</div>
                <div className="text-base font-bold text-charcoal-900 mt-0.5">
                  {validationReport.total_columns}
                </div>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Duplicate Rows</div>
                <div className={`text-base font-bold mt-0.5 ${validationReport.duplicate_row_count > 0 ? 'text-warmAmber-700' : 'text-forest-700'}`}>
                  {validationReport.duplicate_row_count.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Missing Values</div>
                <div className={`text-base font-bold mt-0.5 ${validationReport.missing_values_total > 0 ? 'text-warmAmber-700' : 'text-forest-700'}`}>
                  {validationReport.missing_values_total} ({validationReport.missing_values_percentage}%)
                </div>
              </div>
            </div>

            {/* Feature Classification */}
            <div className="p-3.5 rounded bg-surface border border-border space-y-2">
              <div className="font-semibold text-charcoal-900 flex items-center justify-between">
                <span>Column Type Analysis</span>
                <span className="font-mono text-[11px] text-charcoal-500">
                  {validationReport.numerical_columns.length} Numerical • {validationReport.categorical_columns.length} Categorical
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
                  <span className="text-charcoal-600 font-sans font-medium block mb-1">Numerical Features:</span>
                  <div className="max-h-24 overflow-y-auto text-charcoal-800 leading-relaxed">
                    {validationReport.numerical_columns.join(', ') || 'None detected'}
                  </div>
                </div>
                <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
                  <span className="text-charcoal-600 font-sans font-medium block mb-1">Categorical Features:</span>
                  <div className="max-h-24 overflow-y-auto text-charcoal-800 leading-relaxed">
                    {validationReport.categorical_columns.join(', ') || 'None detected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Zero Variance / Constant columns notice */}
            {validationReport.constant_columns.length > 0 && (
              <div className="p-3 rounded bg-warmAmber-50 border border-warmAmber-200 text-warmAmber-900 text-xs">
                <span className="font-semibold">Constant Columns (Zero Variance): </span>
                {validationReport.constant_columns.join(', ')}. These columns will be recommended for pruning during preprocessing.
              </div>
            )}

            {/* Target Suggestions & Confirmed Label */}
            <div className="p-3.5 rounded bg-surface border border-border space-y-2 font-mono">
              <div className="flex items-center justify-between font-sans">
                <span className="font-semibold text-charcoal-900">Target / Label Identification</span>
                <Badge variant="sage" size="sm">
                  Detected: {validationReport.detected_label_column || 'None'}
                </Badge>
              </div>
              {validationReport.suggested_label_columns.length > 0 && (
                <div className="text-[11px] text-charcoal-600 font-sans">
                  Heuristic Label Candidates:{' '}
                  {validationReport.suggested_label_columns.map(col => (
                    <span
                      key={col}
                      className="inline-block bg-surface-subtle border border-border-subtle px-1.5 py-0.5 rounded mr-1 font-mono text-charcoal-900"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Class Distribution Breakdown from Backend */}
            {validationReport.class_distribution && validationReport.class_distribution.length > 0 && (
              <div className="p-3.5 rounded bg-surface border border-border space-y-2">
                <div className="font-semibold text-charcoal-900 font-sans">
                  Backend Class Distribution (Target: {validationReport.detected_label_column})
                </div>
                <div className="divide-y divide-border-subtle font-mono text-xs">
                  {validationReport.class_distribution.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.is_malicious ? 'bg-mutedRed-500' : 'bg-forest-500'
                          }`}
                        />
                        <span className="font-semibold text-charcoal-900">{item.class_name}</span>
                        {item.is_malicious && (
                          <Badge variant="red" size="sm">
                            Threat Flow
                          </Badge>
                        )}
                      </div>
                      <div className="text-charcoal-700">
                        {item.count.toLocaleString()} samples ({item.percentage}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings list */}
            {validationReport.warnings.length > 0 && (
              <div className="p-3 rounded bg-warmAmber-50 border border-warmAmber-200 text-warmAmber-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-warmAmber-700" />
                  <span>Validation Warnings ({validationReport.warnings.length})</span>
                </div>
                {validationReport.warnings.map((w, idx) => (
                  <p key={idx} className="text-[11px] font-sans">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle font-sans">
              <Button size="sm" variant="outline" onClick={() => setIsValidationModalOpen(false)}>
                Close Report
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setIsValidationModalOpen(false);
                  if (selectedDataset) {
                    window.location.assign(`/preprocessing?dataset=${selectedDataset.id}`);
                  }
                }}
              >
                Proceed to Preprocessing
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
