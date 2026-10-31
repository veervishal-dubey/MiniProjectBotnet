import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Sliders,
  Check,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode,
  Shield,
  Layers,
  ArrowRight,
  Database,
  Info,
  Download,
  Cpu,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { useToast } from '@/components/ui/Toast';
import { storage } from '@/lib/storage';
import { Dataset } from '@/types/dataset';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActiveDataset } from '@/contexts/ActiveDatasetContext';
import { fetchWorkspaceDatasets } from '@/lib/datasetService';
import {
  executePreprocessingApi,
  downloadProcessedDatasetBlob,
  PreprocessingReportDto,
} from '@/lib/backendApi';
import { ActiveDatasetSelector } from '@/components/common/ActiveDatasetSelector';
import {
  PreprocessingConfig,
  PreprocessingValidationSummary,
  PreprocessingJob,
  ScalingMethod,
  CategoricalEncoding,
  ImputationStrategy,
  ImbalanceStrategy,
} from '@/types/preprocessing';

export const PreprocessingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success, error, info } = useToast();
  const { workspace } = useWorkspace();
  const { activeDatasetId } = useActiveDataset();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [jobsHistory, setJobsHistory] = useState<PreprocessingJob[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [latestReport, setLatestReport] = useState<PreprocessingReportDto | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [downloadingSplit, setDownloadingSplit] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState<boolean>(false);

  // Preprocessing config state
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [scalingMethod, setScalingMethod] = useState<ScalingMethod>('robust');
  const [categoricalEncoding, setCategoricalEncoding] = useState<CategoricalEncoding>('onehot');
  const [imputationStrategy, setImputationStrategy] = useState<ImputationStrategy>('median');
  const [imbalanceHandling, setImbalanceHandling] = useState<ImbalanceStrategy>('class_weight');
  const [trainRatio, setTrainRatio] = useState<number>(0.70);
  const [valRatio, setValRatio] = useState<number>(0.15);
  const [testRatio, setTestRatio] = useState<number>(0.15);
  const [randomSeed, setRandomSeed] = useState<number>(42);
  const [stratify, setStratify] = useState<boolean>(true);
  const [removeZeroVariance, setRemoveZeroVariance] = useState<boolean>(true);
  const [dropDuplicates, setDropDuplicates] = useState<boolean>(true);

  // Load datasets & history
  useEffect(() => {
    let isMounted = true;

    async function loadAllDatasets() {
      if (workspace?.id) {
        setIsLoadingDatasets(true);
        try {
          const remoteList = await fetchWorkspaceDatasets(workspace.id);
          const localList = storage.getDatasets(false);
          const mergedMap = new Map<string, Dataset>();
          // Remote datasets from Supabase take precedence
          remoteList.forEach(d => mergedMap.set(d.id, d));
          localList.forEach(d => {
            if (!mergedMap.has(d.id)) mergedMap.set(d.id, d);
          });
          const combined = Array.from(mergedMap.values());
          if (!isMounted) return;
          setDatasets(combined);
          updateSelected(combined);
        } catch (fetchErr) {
          console.warn('Failed to fetch workspace datasets for preprocessing:', fetchErr);
          const cached = storage.getDatasets(false);
          if (!isMounted) return;
          setDatasets(cached);
          updateSelected(cached);
        } finally {
          if (isMounted) setIsLoadingDatasets(false);
        }
      } else {
        const localList = storage.getDatasets(false);
        if (!isMounted) return;
        setDatasets(localList);
        updateSelected(localList);
      }
    }

    function updateSelected(list: Dataset[]) {
      const paramId = searchParams.get('dataset');
      if (paramId && list.some(d => d.id === paramId)) {
        setSelectedDatasetId(paramId);
      } else if (activeDatasetId && list.some(d => d.id === activeDatasetId)) {
        setSelectedDatasetId(activeDatasetId);
      } else if (list.length > 0) {
        setSelectedDatasetId(prev => (prev && list.some(d => d.id === prev) ? prev : list[0].id));
      } else {
        setSelectedDatasetId('');
      }
    }

    loadAllDatasets();
    setJobsHistory(storage.getPreprocessingJobs());

    return () => {
      isMounted = false;
    };
  }, [workspace?.id, searchParams, activeDatasetId]);


  // When selected dataset changes, populate features and target
  const currentDataset = datasets.find(d => d.id === selectedDatasetId);

  useEffect(() => {
    if (activeDatasetId && datasets.some(d => d.id === activeDatasetId)) {
      setSelectedDatasetId(activeDatasetId);
    }
  }, [activeDatasetId, datasets]);

  useEffect(() => {
    if (currentDataset) {
      setTargetColumn(currentDataset.labelColumn);
      // Auto select numeric features and drop identifier-like features
      const features = currentDataset.columns
        .filter(c => c.name !== currentDataset.labelColumn)
        .map(c => c.name);
      setSelectedFeatures(features);
    }
  }, [currentDataset]);

  const toggleFeature = (name: string) => {
    setSelectedFeatures(prev =>
      prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
    );
  };

  const selectAllFeatures = () => {
    if (!currentDataset) return;
    const all = currentDataset.columns
      .filter(c => c.name !== targetColumn)
      .map(c => c.name);
    setSelectedFeatures(all);
  };

  const deselectIdentifiers = () => {
    if (!currentDataset) return;
    const dropPatterns = ['id', 'ip', 'timestamp', 'time', 'flow_id', 'port'];
    const filtered = currentDataset.columns
      .filter(c => c.name !== targetColumn)
      .map(c => c.name)
      .filter(name => !dropPatterns.some(p => name.toLowerCase().includes(p)));
    setSelectedFeatures(filtered);
    info('Pruned Identifiers', 'Deselected IP addresses, timestamps, and ID columns to prevent data leakage.');
  };

  // Validation Summary calculation
  const totalRows = currentDataset ? currentDataset.rowCount : 0;
  const trainSamplesExpected = Math.round(totalRows * trainRatio);
  const valSamplesExpected = Math.round(totalRows * valRatio);
  const testSamplesExpected = Math.round(totalRows * testRatio);

  const warnings: string[] = [];
  if (selectedFeatures.length < 3) {
    warnings.push('Fewer than 3 features selected. Model generalization may be poor.');
  }
  if (Math.abs(trainRatio + valRatio + testRatio - 1.0) > 0.001) {
    warnings.push('Split ratios do not sum to 1.0 (100%). Adjust train/val/test splits.');
  }

  const handleStageConfig = () => {
    if (!currentDataset) return;

    const config: PreprocessingConfig = {
      datasetId: currentDataset.id,
      selectedFeatures,
      targetColumn,
      dropColumns: currentDataset.columns
        .map(c => c.name)
        .filter(c => !selectedFeatures.includes(c) && c !== targetColumn),
      scalingMethod,
      categoricalEncoding,
      imputationStrategy,
      imbalanceHandling,
      trainRatio,
      valRatio,
      testRatio,
      randomSeed,
      stratify,
      removeZeroVariance,
      dropDuplicates,
    };

    const newJob: PreprocessingJob = {
      id: `prep-job-${Date.now()}`,
      datasetId: currentDataset.id,
      datasetName: currentDataset.name,
      config,
      status: 'configured',
      createdAt: new Date().toISOString(),
      trainRows: trainSamplesExpected,
      valRows: valSamplesExpected,
      testRows: testSamplesExpected,
      retainedFeatureCount: selectedFeatures.length,
      isBackendJob: false,
    };

    storage.savePreprocessingJob(newJob);
    setJobsHistory(prev => [newJob, ...prev]);

    success(
      'Preprocessing Configuration Saved',
      `Configuration saved for ${currentDataset.name}. Persisted locally for pipeline execution.`
    );
  };

  const handleRunBackendPipeline = async () => {
    if (!currentDataset) return;
    setIsExecuting(true);
    try {
      const dropColumns = currentDataset.columns
        .map(c => c.name)
        .filter(c => !selectedFeatures.includes(c) && c !== targetColumn);

      const report = await executePreprocessingApi({
        datasetId: currentDataset.id,
        targetColumn,
        selectedFeatures,
        dropColumns,
        scalingMethod,
        categoricalEncoding,
        imputationStrategy,
        removeZeroVariance,
        dropDuplicates,
        trainRatio,
        valRatio,
        testRatio,
        randomSeed,
        stratify,
      });

      setLatestReport(report);
      setIsReportModalOpen(true);

      const completedJob: PreprocessingJob = {
        id: report.job_id,
        datasetId: currentDataset.id,
        datasetName: currentDataset.name,
        config: {
          datasetId: currentDataset.id,
          selectedFeatures,
          targetColumn,
          dropColumns,
          scalingMethod,
          categoricalEncoding,
          imputationStrategy,
          imbalanceHandling,
          trainRatio,
          valRatio,
          testRatio,
          randomSeed,
          stratify,
          removeZeroVariance,
          dropDuplicates,
        },
        status: 'completed',
        createdAt: report.created_at,
        completedAt: report.created_at,
        trainRows: report.train_rows,
        valRows: report.val_rows,
        testRows: report.test_rows,
        retainedFeatureCount: report.feature_names.length,
        isBackendJob: true,
      };

      storage.savePreprocessingJob(completedJob);
      setJobsHistory(prev => [completedJob, ...prev]);

      success(
        'FastAPI Pipeline Execution Succeeded',
        `Transformed dataset without data leakage. Retained ${report.feature_names.length} features across ${report.processed_rows.toLocaleString()} records.`
      );
    } catch (err: any) {
      console.error('FastAPI preprocessing failed:', err);
      error('Pipeline Execution Failed', err.message || 'An error occurred during pipeline execution.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDownloadSplit = async (jobId: string, split: 'full' | 'train' | 'test') => {
    setDownloadingSplit(split);
    try {
      const { blob, filename } = await downloadProcessedDatasetBlob(jobId, split);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      success('Download Started', `Downloaded ${filename}`);
    } catch (err: any) {
      error('Download Failed', err.message || 'Could not download processed dataset.');
    } finally {
      setDownloadingSplit(null);
    }
  };

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="info"
        message="Training Preprocessing Pipeline: Configures stratified splits (Train/Val/Test) and fits transformations (RobustScaler, Imputation, OneHot) strictly on X_train to prevent data leakage. Note: Real-time inference with the trained Centralized MLP operates on the fixed 39-feature contract defined in feature_columns.joblib."
      />

      {/* Persistent Global Active Dataset Selector */}
      <ActiveDatasetSelector
        onDatasetChanged={d => {
          if (d) setSelectedDatasetId(d.id);
        }}
      />

      {/* Pipeline Configurator Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Pipeline Steps */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Feature Selection */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span>Step 1: Feature Selection Checklist</span>
                </CardTitle>
                <CardDescription>
                  Select flow features to retain. Exclude identifiers that cause spatial overfitting.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={deselectIdentifiers}>
                  Prune IDs & IPs
                </Button>
                <Button size="sm" variant="ghost" onClick={selectAllFeatures}>
                  Select All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {currentDataset ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1 border border-border-subtle rounded bg-surface-subtle/30">
                  {currentDataset.columns
                    .filter(c => c.name !== targetColumn)
                    .map(col => {
                      const isSelected = selectedFeatures.includes(col.name);
                      return (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() => toggleFeature(col.name)}
                          className={`flex items-center justify-between p-2 rounded text-left border text-xs transition-colors ${
                            isSelected
                              ? 'bg-forest-50 border-forest-300 text-forest-900 font-medium'
                              : 'bg-surface border-border text-charcoal-500 hover:border-charcoal-300'
                          }`}
                        >
                          <span className="truncate font-mono text-[11px]">{col.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-forest-700 flex-shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-charcoal-400">No dataset loaded.</p>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-charcoal-500 font-mono">
                <span>Selected: {selectedFeatures.length} of {currentDataset ? currentDataset.columns.length - 1 : 0} attributes</span>
                <span className="text-forest-700">Retaining {((selectedFeatures.length / (currentDataset?.columns.length || 1)) * 100).toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Numerical Scaling & Categorical Encoding */}
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Transformations & Scaling</CardTitle>
              <CardDescription>
                IoT network flow statistics often span 6 orders of magnitude (volumetric spikes).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Numerical Scaling Algorithm"
                value={scalingMethod}
                onChange={e => setScalingMethod(e.target.value as ScalingMethod)}
                options={[
                  { value: 'robust', label: 'RobustScaler (Median / IQR - Recommended for DDoS)' },
                  { value: 'standard', label: 'StandardScaler (Zero mean, unit variance)' },
                  { value: 'minmax', label: 'MinMaxScaler (Bounds [0, 1])' },
                  { value: 'none', label: 'None (Raw features)' },
                ]}
                helperText="RobustScaler resists extreme burst packet counts."
              />

              <Select
                label="Categorical Feature Encoding"
                value={categoricalEncoding}
                onChange={e => setCategoricalEncoding(e.target.value as CategoricalEncoding)}
                options={[
                  { value: 'onehot', label: 'One-Hot Encoding (Protocol, flags)' },
                  { value: 'ordinal', label: 'Ordinal Integer Encoding' },
                  { value: 'none', label: 'None (Drop categoricals)' },
                ]}
                helperText="Expands non-numeric fields into sparse binary vectors."
              />

              <Select
                label="Missing Value Imputation"
                value={imputationStrategy}
                onChange={e => setImputationStrategy(e.target.value as ImputationStrategy)}
                options={[
                  { value: 'median', label: 'Median Imputation (Skewed distributions)' },
                  { value: 'mean', label: 'Mean Imputation' },
                  { value: 'zero', label: 'Constant Zero Fill' },
                ]}
                helperText="Fills null or infinite flow duration records."
              />

              <Select
                label="Class Imbalance Resolution"
                value={imbalanceHandling}
                onChange={e => setImbalanceHandling(e.target.value as ImbalanceStrategy)}
                options={[
                  { value: 'class_weight', label: 'Cost-Sensitive Class Weights (Loss penalty)' },
                  { value: 'smote', label: 'SMOTE (Synthetic Minority Oversampling)' },
                  { value: 'undersample', label: 'Random Majority Undersampling' },
                  { value: 'none', label: 'None (Natural class proportions)' },
                ]}
                helperText="Counteracts rare attack class underrepresentation."
              />
            </CardContent>
          </Card>

          {/* Step 3: Train / Validation / Test Partitioning */}
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Train / Validation / Test Splitting</CardTitle>
              <CardDescription>
                Define data splits for baseline fitting and local client training.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Train Ratio (%)"
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="0.9"
                  value={trainRatio}
                  onChange={e => setTrainRatio(Number(e.target.value))}
                  helperText={`${(trainRatio * 100).toFixed(0)}%`}
                />
                <Input
                  label="Validation Ratio (%)"
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="0.3"
                  value={valRatio}
                  onChange={e => setValRatio(Number(e.target.value))}
                  helperText={`${(valRatio * 100).toFixed(0)}%`}
                />
                <Input
                  label="Test Ratio (%)"
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="0.3"
                  value={testRatio}
                  onChange={e => setTestRatio(Number(e.target.value))}
                  helperText={`${(testRatio * 100).toFixed(0)}%`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Input
                  label="Pseudo-Random Seed"
                  type="number"
                  value={randomSeed}
                  onChange={e => setRandomSeed(Number(e.target.value))}
                  helperText="Enables exact research reproducibility."
                  mono={true}
                />
                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-charcoal-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stratify}
                      onChange={e => setStratify(e.target.checked)}
                      className="rounded border-border text-forest-800 focus:ring-forest-700"
                    />
                    <span>Stratify Splits (Preserve attack proportions)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-charcoal-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dropDuplicates}
                      onChange={e => setDropDuplicates(e.target.checked)}
                      className="rounded border-border text-forest-800 focus:ring-forest-700"
                    />
                    <span>Drop Exact Duplicate Flow Records</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Validation Summary & Action */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration Validation</CardTitle>
              <CardDescription>
                Summary of mathematical operations to be executed on dataset.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Retained Features:</span>
                  <span className="font-semibold text-charcoal-900">{selectedFeatures.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Expected Train Set:</span>
                  <span className="font-semibold text-forest-800">{trainSamplesExpected.toLocaleString()} flows</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Expected Val Set:</span>
                  <span className="font-semibold text-charcoal-900">{valSamplesExpected.toLocaleString()} flows</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-charcoal-500 font-sans">Expected Test Set:</span>
                  <span className="font-semibold text-charcoal-900">{testSamplesExpected.toLocaleString()} flows</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-charcoal-500 font-sans">Scaling Engine:</span>
                  <span className="font-semibold text-charcoal-900">{scalingMethod}</span>
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="p-3 rounded bg-warmAmber-50 border border-warmAmber-200 text-xs text-warmAmber-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-warmAmber-700" />
                    Validation Notice
                  </div>
                  {warnings.map((w, idx) => (
                    <p key={idx} className="text-[11px]">{w}</p>
                  ))}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Button
                  size="md"
                  variant="primary"
                  className="w-full"
                  isLoading={isExecuting}
                  disabled={isExecuting || !currentDataset}
                  onClick={handleRunBackendPipeline}
                  leftIcon={<Play className="w-4 h-4 fill-current" />}
                >
                  Execute FastAPI Preprocessing Pipeline
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-charcoal-700"
                  onClick={handleStageConfig}
                  disabled={isExecuting || !currentDataset}
                  leftIcon={<Sliders className="w-3.5 h-3.5" />}
                >
                  Save Preprocessing Configuration
                </Button>
              </div>
              <p className="text-[11px] text-charcoal-400 text-center leading-tight">
                Executes leak-free scikit-learn pipeline on private Supabase storage file.
              </p>
            </CardContent>
          </Card>

          {/* Preprocessing History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-wider text-charcoal-500">
                Pipeline Staging Log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {jobsHistory.length === 0 ? (
                <p className="text-xs text-charcoal-400 font-mono py-2">
                  No preprocessing configs staged yet.
                </p>
              ) : (
                jobsHistory.slice(0, 3).map(job => (
                  <div
                    key={job.id}
                    className="p-2.5 rounded border border-border bg-surface-subtle/50 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-charcoal-900 truncate">
                        {job.datasetName}
                      </span>
                      <Badge variant="sage" size="sm">
                        {job.status}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-charcoal-500 font-mono mt-1">
                      {job.retainedFeatureCount} feats • Train: {job.trainRows?.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preprocessing Completion Report Modal */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="FastAPI Preprocessing Pipeline Report"
        description="Empirical transformations executed by backend scikit-learn and pandas pipeline."
        maxWidth="xl"
      >
        {latestReport && (
          <div className="space-y-4 text-xs font-sans max-h-[75vh] overflow-y-auto pr-1">
            {/* Status Summary Banner */}
            <div className="p-3.5 rounded border bg-forest-50 border-forest-200 text-forest-900 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-forest-700 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-sm">Pipeline Execution Succeeded</div>
                <p className="text-xs opacity-90">
                  Processed in {latestReport.execution_time_seconds}s. Transformed from{' '}
                  <span className="font-mono font-bold">{latestReport.original_rows.toLocaleString()}</span> to{' '}
                  <span className="font-mono font-bold">{latestReport.processed_rows.toLocaleString()}</span> flow records.
                </p>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Retained Features</div>
                <div className="text-base font-bold text-charcoal-900 mt-0.5">
                  {latestReport.feature_names.length}
                </div>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Train Partition</div>
                <div className="text-base font-bold text-forest-800 mt-0.5">
                  {latestReport.train_rows.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Val Partition</div>
                <div className="text-base font-bold text-charcoal-900 mt-0.5">
                  {latestReport.val_rows.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border-subtle">
                <div className="text-charcoal-500 text-[10px] uppercase">Test Partition</div>
                <div className="text-base font-bold text-charcoal-900 mt-0.5">
                  {latestReport.test_rows.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Target and ground truth preservation */}
            <div className="p-3 rounded bg-surface border border-border space-y-1 font-mono">
              <div className="flex items-center justify-between font-sans">
                <span className="font-semibold text-charcoal-900">Ground Truth Target Column</span>
                <Badge variant="sage" size="sm">
                  {latestReport.target_name || 'None'}
                </Badge>
              </div>
              {latestReport.target_classes && (
                <div className="text-[11px] text-charcoal-600 font-sans">
                  Target Classes ({latestReport.target_classes.length}):{' '}
                  <span className="font-mono text-charcoal-900 font-semibold">
                    {latestReport.target_classes.join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Cleaning Operations Performed */}
            <div className="p-3.5 rounded bg-surface border border-border space-y-2">
              <div className="font-semibold text-charcoal-900 font-sans">
                Operations Executed ({latestReport.operations_performed.length})
              </div>
              <div className="space-y-1.5 font-mono text-[11px] max-h-36 overflow-y-auto">
                {latestReport.operations_performed.map((op, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-charcoal-800">
                    <Check className="w-3.5 h-3.5 text-forest-700 flex-shrink-0 mt-0.5" />
                    <span>{op}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Columns Removed with Rationale */}
            {Object.keys(latestReport.columns_removed).length > 0 && (
              <div className="p-3.5 rounded bg-surface border border-border space-y-2">
                <div className="font-semibold text-charcoal-900 font-sans">
                  Columns Pruned ({Object.keys(latestReport.columns_removed).length})
                </div>
                <div className="divide-y divide-border-subtle font-mono text-[11px]">
                  {Object.entries(latestReport.columns_removed).map(([col, reason], idx) => (
                    <div key={idx} className="py-1 flex items-center justify-between">
                      <span className="text-charcoal-900 font-bold">{col}</span>
                      <span className="text-charcoal-500 font-sans">{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download Processed Dataset Section */}
            <div className="p-3.5 rounded bg-forest-50/70 border border-forest-200 space-y-2.5">
              <div className="font-semibold text-forest-900 font-sans flex items-center gap-1.5">
                <Download className="w-4 h-4 text-forest-700" />
                <span>Download Cleaned Artifacts</span>
              </div>
              <p className="text-[11px] text-forest-800 font-sans leading-relaxed">
                Download the processed dataset or training/testing partitions for decentralized model ingestion.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 font-sans">
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={downloadingSplit === 'full'}
                  disabled={downloadingSplit !== null}
                  onClick={() => handleDownloadSplit(latestReport.job_id, 'full')}
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                >
                  Download Full Processed CSV
                </Button>
                {latestReport.train_rows > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-forest-300 text-forest-800 hover:bg-forest-100"
                    isLoading={downloadingSplit === 'train'}
                    disabled={downloadingSplit !== null}
                    onClick={() => handleDownloadSplit(latestReport.job_id, 'train')}
                  >
                    Download Train Split ({latestReport.train_rows.toLocaleString()})
                  </Button>
                )}
                {latestReport.test_rows > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-forest-300 text-forest-800 hover:bg-forest-100"
                    isLoading={downloadingSplit === 'test'}
                    disabled={downloadingSplit !== null}
                    onClick={() => handleDownloadSplit(latestReport.job_id, 'test')}
                  >
                    Download Test Split ({latestReport.test_rows.toLocaleString()})
                  </Button>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle font-sans">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setIsReportModalOpen(false);
                  navigate('/detection');
                }}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Proceed to Flow Detection
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsReportModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
