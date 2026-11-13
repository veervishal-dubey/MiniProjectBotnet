import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  Layers,
  ArrowRight,
  Shield,
  Zap,
  Info,
  Database,
  Activity,
  UploadCloud,
  FileText,
  Check,
  FileCheck,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { ConfusionMatrix } from '@/components/charts/ConfusionMatrix';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useActiveDataset } from '@/contexts/ActiveDatasetContext';
import { ActiveDatasetSelector } from '@/components/common/ActiveDatasetSelector';
import { EvaluationExperiment, ConfusionMatrixData } from '@/types/evaluation';
import { apiClient } from '@/api/client';

export const EvaluationPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error, info } = useToast();
  const { activeDataset, activeDatasetId } = useActiveDataset();

  // Active Tab: 'active-dataset' vs 'benchmarks'
  const [activeTab, setActiveTab] = useState<'active-dataset' | 'benchmarks'>('active-dataset');

  // Active dataset evaluation metrics from backend
  const [datasetEval, setDatasetEval] = useState<any | null>(null);
  const [isLoadingDatasetEval, setIsLoadingDatasetEval] = useState<boolean>(false);
  const [isEvaluatingFile, setIsEvaluatingFile] = useState<boolean>(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<any[]>([]);

  // Selected file for upload evaluation
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Historical benchmarks
  const [experiments, setExperiments] = useState<EvaluationExperiment[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string>('eval-fedavg-iid');
  const [isLoadingBenchmarks, setIsLoadingBenchmarks] = useState(true);

  // Load benchmarks and evaluation history on mount
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoadingBenchmarks(true);
      try {
        const [benchRes, histRes] = await Promise.allSettled([
          apiClient.getEvaluationExperiments(),
          apiClient.getEvaluationHistory(),
        ]);

        if (isMounted && benchRes.status === 'fulfilled' && benchRes.value.data?.length > 0) {
          setExperiments(benchRes.value.data);
          setActiveExperimentId(benchRes.value.data[0]?.id || 'eval-fedavg-iid');
        }

        if (isMounted && histRes.status === 'fulfilled' && Array.isArray(histRes.value)) {
          setEvaluationHistory(histRes.value);
        }
      } catch (err) {
        console.warn('Could not load benchmarks or history:', err);
      } finally {
        if (isMounted) setIsLoadingBenchmarks(false);
      }
    };

    loadData();

    // Check localStorage cache for last active evaluation
    try {
      const cached = localStorage.getItem('sentinelfl_active_eval');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.has_ground_truth || parsed.hasGroundTruth)) {
          setDatasetEval(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch active dataset evaluation whenever activeDataset changes
  useEffect(() => {
    let isMounted = true;
    async function loadDatasetEvaluation() {
      if (!activeDatasetId) {
        return;
      }
      setIsLoadingDatasetEval(true);
      setEvaluationError(null);
      try {
        const data = await apiClient.getDatasetEvaluation(activeDatasetId);
        if (isMounted && data && (data.has_ground_truth || data.hasGroundTruth)) {
          setDatasetEval(data);
          try {
            localStorage.setItem('sentinelfl_active_eval', JSON.stringify(data));
          } catch {}
        }
      } catch (err) {
        console.warn('Failed to load active dataset evaluation:', err);
      } finally {
        if (isMounted) setIsLoadingDatasetEval(false);
      }
    }
    loadDatasetEvaluation();
    return () => {
      isMounted = false;
    };
  }, [activeDatasetId]);

  // Handle direct file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.csv')) {
        error('Invalid File Type', 'Please upload a CSV dataset file (.csv)');
        return;
      }
      setSelectedFile(file);
      setEvaluationError(null);
    }
  };

  // Run evaluation on selected file
  const handleEvaluateFile = async () => {
    if (!selectedFile) return;

    setIsEvaluatingFile(true);
    setEvaluationError(null);

    try {
      const result = await apiClient.evaluateCsv(selectedFile);
      setDatasetEval(result);
      try {
        localStorage.setItem('sentinelfl_active_eval', JSON.stringify(result));
      } catch {}

      // Refresh history list
      try {
        const hist = await apiClient.getEvaluationHistory();
        setEvaluationHistory(hist);
      } catch {}

      success(
        'Genuine Evaluation Completed',
        `Evaluated ${result.evaluated_samples || result.total_samples || 0} samples with FLMLP model. Accuracy: ${((result.accuracy || 0) * 100).toFixed(2)}%.`
      );
    } catch (err: any) {
      console.error('File evaluation error:', err);
      const msg = err.message || 'Evaluation failed. Ensure the dataset contains a valid ground-truth label column.';
      setEvaluationError(msg);
      error('Evaluation Failed', msg);
    } finally {
      setIsEvaluatingFile(false);
    }
  };

  // Export report handler
  const handleExportReport = (fmt: 'markdown' | 'json' | 'csv') => {
    if (!datasetEval) return;
    const evalId = datasetEval.id || datasetEval.eval_id;

    if (evalId) {
      const url = apiClient.getEvaluationReportUrl(evalId, fmt);
      window.open(url, '_blank');
      success('Report Export Initiated', `Downloading evaluation report as ${fmt.toUpperCase()}.`);
    } else {
      // Local fallback export
      if (fmt === 'json') {
        const blob = new Blob([JSON.stringify(datasetEval, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evaluation_report_${Date.now()}.json`;
        a.click();
      } else {
        info('Export Available', 'Use Markdown copy button to copy table to clipboard.');
      }
    }
  };

  const activeExp = experiments.find(e => e.id === activeExperimentId) || experiments[0];

  // Dynamic research takeaway metrics computed strictly from the underlying benchmark records
  const dynamicTakeaways = useMemo(() => {
    if (!experiments || experiments.length === 0) return null;

    const baselineExp = experiments.find(e => e.isBaseline) || experiments[0];
    const nonIidExp =
      experiments.find(e => e.id.includes('dir') || e.name.toLowerCase().includes('dirichlet')) ||
      experiments[1] ||
      baselineExp;
    const isolatedExp =
      experiments.find(e => e.id.includes('silo') || e.name.toLowerCase().includes('isolated')) ||
      experiments[experiments.length - 1];

    const f1Delta = Math.abs((baselineExp.f1Score - nonIidExp.f1Score) * 100).toFixed(2);
    const dataSavings =
      baselineExp.dataTransferredMb > 0
        ? (((baselineExp.dataTransferredMb - nonIidExp.dataTransferredMb) / baselineExp.dataTransferredMb) * 100).toFixed(1)
        : '0.0';

    return {
      baselineName: baselineExp.name,
      baselineF1: (baselineExp.f1Score * 100).toFixed(2),
      nonIidName: nonIidExp.name,
      nonIidF1: (nonIidExp.f1Score * 100).toFixed(2),
      f1Delta,
      dataSavings,
      nonIidEgress: nonIidExp.dataTransferredMb,
      baselineEgress: baselineExp.dataTransferredMb,
      isolatedName: isolatedExp?.name,
      isolatedF1: isolatedExp ? (isolatedExp.f1Score * 100).toFixed(2) : undefined,
    };
  }, [experiments]);

  const handleCopyMarkdown = () => {
    if (!experiments.length) return;

    let md = '| Experiment | Architecture | Accuracy | Precision | Recall | Macro F1 | FPR | Data Transferred |\n';
    md += '|---|---|---|---|---|---|---|---|\n';
    experiments.forEach(e => {
      md += `| ${e.name} | ${e.modelArchitecture} | ${(e.accuracy * 100).toFixed(2)}% | ${(e.precision * 100).toFixed(2)}% | ${(e.recall * 100).toFixed(2)}% | ${(e.f1Score * 100).toFixed(2)}% | ${(e.falsePositiveRate * 100).toFixed(2)}% | ${e.dataTransferredMb} MB |\n`;
    });

    navigator.clipboard.writeText(md);
    success('Benchmark Table Copied', 'Markdown table copied to your clipboard for research writeups.');
  };

  // Convert dataset evaluation confusion matrix to ConfusionMatrixData format
  const activeDatasetConfusionMatrix: ConfusionMatrixData | null = useMemo(() => {
    const cm = datasetEval?.confusion_matrix || datasetEval?.confusionMatrix;
    if (!cm || !cm.matrix) return null;
    return {
      classes: cm.classes || [],
      matrix: cm.matrix || [],
      totalSamples: datasetEval.evaluated_samples || datasetEval.totalSamples || datasetEval.total_samples || cm.totalSamples || 0,
      accuracy: datasetEval.accuracy || 0,
    };
  }, [datasetEval]);

  const perClassList = datasetEval?.per_class_performance || datasetEval?.perClassPerformance || [];

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="info"
        message="Evaluation Workspace: Upload a labelled test dataset for genuine PyTorch FLMLP evaluation, or review empirical benchmark comparisons across Centralized ML and collaborative FedAvg (175,669 historical test flows)."
      />

      {/* Persistent Global Active Dataset Selector */}
      <ActiveDatasetSelector />

      {/* Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-1">
        <Tabs
          tabs={[
            {
              id: 'active-dataset',
              label: 'Labelled Test Dataset Evaluation',
              icon: <Database className="w-4 h-4" />,
            },
            {
              id: 'benchmarks',
              label: 'Historical Benchmark Experiments (175,669 Flows)',
              icon: <BarChart3 className="w-4 h-4" />,
            },
          ]}
          activeTab={activeTab}
          onChange={tabId => setActiveTab(tabId as any)}
        />

        {activeTab === 'benchmarks' && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyMarkdown}
          >
            Copy Markdown Table
          </Button>
        )}
      </div>

      {/* TAB 1: Labelled Test Dataset Evaluation */}
      {activeTab === 'active-dataset' && (
        <div className="space-y-6">
          {/* Direct CSV Upload & Evaluation Dropzone Card */}
          <Card className="border-forest-200 bg-surface">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-forest-800" />
                    <span>Upload Labelled Test Dataset for Genuine Evaluation</span>
                  </CardTitle>
                  <CardDescription>
                    The backend isolates target labels to prevent data leakage, aligns features to the canonical 39 network flow inputs, executes real forward passes through the PyTorch FLMLP (mlp_model.pth), and computes authentic metrics.
                  </CardDescription>
                </div>
                {evaluationHistory.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-charcoal-500 font-mono">History:</span>
                    <select
                      className="text-xs border border-border rounded px-2 py-1 bg-surface text-charcoal-800 font-mono"
                      value={datasetEval?.id || datasetEval?.eval_id || ''}
                      onChange={e => {
                        const run = evaluationHistory.find(h => (h.id || h.eval_id) === e.target.value);
                        if (run) {
                          setDatasetEval(run);
                          try {
                            localStorage.setItem('sentinelfl_active_eval', JSON.stringify(run));
                          } catch {}
                        }
                      }}
                    >
                      <option value="">Select past evaluation...</option>
                      {evaluationHistory.map(h => (
                        <option key={h.id || h.eval_id} value={h.id || h.eval_id}>
                          {h.dataset_name || h.datasetName || 'Dataset'} ({(h.accuracy * 100).toFixed(1)}% Acc)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => fileInputRef.current?.click()}
                  leftIcon={<FileText className="w-4 h-4" />}
                >
                  {selectedFile ? selectedFile.name : 'Choose Labelled Test CSV...'}
                </Button>

                {selectedFile && (
                  <span className="text-xs text-charcoal-500 font-mono">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={!selectedFile || isEvaluatingFile}
                  isLoading={isEvaluatingFile}
                  onClick={handleEvaluateFile}
                  leftIcon={<Zap className="w-4 h-4" />}
                >
                  {isEvaluatingFile ? 'Evaluating with PyTorch FLMLP...' : 'Run Empirical Model Evaluation'}
                </Button>
              </div>

              {evaluationError && (
                <div className="p-3 rounded bg-mutedRed-50 border border-mutedRed-200 text-mutedRed-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-mutedRed-600 flex-shrink-0" />
                  <span>{evaluationError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evaluation Results Section */}
          {isLoadingDatasetEval ? (
            <Card className="p-8 text-center text-charcoal-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-forest-700" />
              <span className="text-sm font-medium">Loading evaluation metrics for active dataset...</span>
            </Card>
          ) : !datasetEval || !(datasetEval.has_ground_truth || datasetEval.hasGroundTruth) ? (
            <EmptyState
              title={activeDataset ? `No Evaluation Metrics Available for "${activeDataset.name}"` : 'No Dataset Evaluated Yet'}
              description={
                activeDataset
                  ? `Active dataset "${activeDataset.name}" has not been evaluated against ground-truth labels yet. Upload a labelled test CSV above or classify this dataset in Flow Detection.`
                  : 'Upload a labelled test dataset (CSV) above to evaluate the PyTorch FLMLP model and compute genuine metrics, confusion matrix, and per-class reports.'
              }
              actionLabel="Go to Flow Detection"
              onAction={() => navigate('/detection')}
            />
          ) : (
            <>
              {/* Header Info & Export Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded bg-surface border border-border">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-charcoal-900 font-sans">
                      Dataset Evaluation: {datasetEval.dataset_name || datasetEval.datasetName || activeDataset?.name || 'Test Dataset'}
                    </h3>
                    <Badge variant="forest" size="sm" dot>
                      Ground-Truth Verified
                    </Badge>
                  </div>
                  <p className="text-xs text-charcoal-500 font-mono mt-1">
                    Evaluated on {(datasetEval.evaluated_samples || datasetEval.totalSamples || datasetEval.total_samples || 0).toLocaleString()} valid flows • Model: {datasetEval.model_version || datasetEval.modelVersion || 'FLMLP (39→128→64→32→7)'} • Timestamp: {datasetEval.evaluated_at || datasetEval.evaluatedAt || 'Recent'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={() => handleExportReport('markdown')}
                  >
                    Export Markdown
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={() => handleExportReport('json')}
                  >
                    Export JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={() => handleExportReport('csv')}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Summary Metric Cards (7 Genuine Metrics) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Accuracy
                  </span>
                  <div className="text-lg font-bold text-forest-800 font-mono mt-0.5">
                    {((datasetEval.accuracy || 0) * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Macro F1-Score
                  </span>
                  <div className="text-lg font-bold text-forest-800 font-mono mt-0.5">
                    {(((datasetEval.macro_f1 ?? datasetEval.f1Score ?? datasetEval.f1_score ?? 0)) * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Weighted F1-Score
                  </span>
                  <div className="text-lg font-bold text-forest-800 font-mono mt-0.5">
                    {(((datasetEval.weighted_f1 ?? datasetEval.weightedF1 ?? datasetEval.macro_f1 ?? 0)) * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Macro Precision
                  </span>
                  <div className="text-lg font-bold text-charcoal-900 font-mono mt-0.5">
                    {(((datasetEval.macro_precision ?? datasetEval.precision ?? 0)) * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Macro Recall
                  </span>
                  <div className="text-lg font-bold text-charcoal-900 font-mono mt-0.5">
                    {(((datasetEval.macro_recall ?? datasetEval.recall ?? 0)) * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    False Positive Rate
                  </span>
                  <div className="text-lg font-bold text-charcoal-700 font-mono mt-0.5">
                    {(((datasetEval.false_positive_rate ?? datasetEval.falsePositiveRate ?? datasetEval.fpr ?? 0)) * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    False Negative Rate
                  </span>
                  <div className="text-lg font-bold text-charcoal-700 font-mono mt-0.5">
                    {(((datasetEval.false_negative_rate ?? datasetEval.falseNegativeRate ?? datasetEval.fnr ?? 0)) * 100).toFixed(2)}%
                  </div>
                </Card>
              </div>

              {/* Confusion Matrix and Per-Class Breakdown Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Genuine 7x7 Confusion Matrix */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Empirical Confusion Matrix (7x7)</CardTitle>
                        <CardDescription>
                          Evaluated against actual ground-truth labels using PyTorch FLMLP.
                        </CardDescription>
                      </div>
                      <Badge variant="forest">
                        {(datasetEval.evaluated_samples || datasetEval.totalSamples || datasetEval.total_samples || 0).toLocaleString()} Flows
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activeDatasetConfusionMatrix ? (
                      <ConfusionMatrix data={activeDatasetConfusionMatrix} />
                    ) : (
                      <div className="text-xs text-charcoal-400 p-4">No matrix data available.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Per-Class Attack Detection Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Per-Class Attack Detection Metrics</CardTitle>
                    <CardDescription>
                      Breakdown of precision, recall, and F1 across all evaluated traffic classes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto border border-border rounded">
                      <table className="w-full text-xs text-left font-mono border-collapse">
                        <thead>
                          <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-sans">
                            <th className="py-2 px-3">Class</th>
                            <th className="py-2 px-3">Precision</th>
                            <th className="py-2 px-3">Recall</th>
                            <th className="py-2 px-3">F1-Score</th>
                            <th className="py-2 px-3">FPR</th>
                            <th className="py-2 px-3">Support</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle bg-surface">
                          {perClassList.map((item: any) => (
                            <tr key={item.className || item.class_name} className="hover:bg-surface-subtle/50">
                              <td className="py-2 px-3 font-semibold text-charcoal-900 font-sans">
                                {item.className || item.class_name}
                              </td>
                              <td className="py-2 px-3 text-charcoal-800">
                                {((item.precision || 0) * 100).toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-charcoal-800">
                                {((item.recall || 0) * 100).toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 font-bold text-forest-800">
                                {(((item.f1Score ?? item.f1_score ?? 0)) * 100).toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-charcoal-600">
                                {(((item.falsePositiveRate ?? item.false_positive_rate ?? item.fpr ?? 0)) * 100).toFixed(2)}%
                              </td>
                              <td className="py-2 px-3 text-charcoal-500 font-mono">
                                {(item.support || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Historical Benchmark Experiments */}
      {activeTab === 'benchmarks' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-charcoal-900 font-sans">
                Cross-Paradigm Benchmark Experiments
              </h3>
              <p className="text-xs text-charcoal-500 font-mono mt-0.5">
                Evaluated on 175,669 held-out test split flows from the Curated IoT Traffic Corpus.
              </p>
            </div>
            <Badge variant="sage">Historical Empirical Benchmark</Badge>
          </div>

          {isLoadingBenchmarks ? (
            <Card className="p-8 text-center text-charcoal-500">
              <span className="text-sm font-medium">Loading evaluation benchmarks...</span>
            </Card>
          ) : experiments.length === 0 ? (
            <EmptyState
              title="No ground-truth evaluation results available"
              description="Evaluation comparisons require completed training experiments with ground-truth labels. Once models are evaluated, empirical results will appear here."
            />
          ) : (
            <>
              {/* Comparative Matrix Table */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div>
                    <CardTitle>Cross-Paradigm Benchmark Matrix</CardTitle>
                    <CardDescription>
                      Click an experiment row to inspect its normalized confusion matrix and per-class breakdown.
                    </CardDescription>
                  </div>
                  <Badge variant="sage">{experiments.length} Experiments Staged</Badge>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto border border-border rounded">
                    <table className="w-full text-xs text-left font-mono border-collapse">
                      <thead>
                        <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans">
                          <th className="py-2.5 px-3">Experiment Name</th>
                          <th className="py-2.5 px-3">Architecture</th>
                          <th className="py-2.5 px-3">Accuracy</th>
                          <th className="py-2.5 px-3">Precision</th>
                          <th className="py-2.5 px-3">Recall</th>
                          <th className="py-2.5 px-3">Macro F1</th>
                          <th className="py-2.5 px-3">FPR</th>
                          <th className="py-2.5 px-3">Latency</th>
                          <th className="py-2.5 px-3">Data Egress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle bg-surface">
                        {experiments.map(exp => {
                          const isSelected = activeExp?.id === exp.id;
                          return (
                            <tr
                              key={exp.id}
                              onClick={() => setActiveExperimentId(exp.id)}
                              className={`hover:bg-surface-subtle/70 cursor-pointer transition-colors ${
                                isSelected ? 'bg-forest-50/70 font-semibold' : ''
                              }`}
                            >
                              <td className="py-3 px-3 font-sans">
                                <div className="font-semibold text-charcoal-900 flex items-center gap-1.5">
                                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-forest-700" />}
                                  <span>{exp.name}</span>
                                  {exp.isBaseline && (
                                    <Badge variant="neutral" size="sm">
                                      Baseline
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[11px] text-charcoal-500 font-mono">
                                  {exp.datasetName}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-charcoal-700">{exp.modelArchitecture}</td>
                              <td className="py-3 px-3 text-charcoal-900">
                                {(exp.accuracy * 100).toFixed(2)}%
                              </td>
                              <td className="py-3 px-3 text-charcoal-800">
                                {(exp.precision * 100).toFixed(2)}%
                              </td>
                              <td className="py-3 px-3 text-charcoal-800">
                                {(exp.recall * 100).toFixed(2)}%
                              </td>
                              <td className="py-3 px-3 font-bold text-forest-800">
                                {(exp.f1Score * 100).toFixed(2)}%
                              </td>
                              <td className="py-3 px-3 text-charcoal-700">
                                {(exp.falsePositiveRate * 100).toFixed(2)}%
                              </td>
                              <td className="py-3 px-3 text-charcoal-700">
                                {exp.inferenceLatencyMs} ms
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`font-semibold ${
                                    exp.dataTransferredMb > 50
                                      ? 'text-warmAmber-700'
                                      : 'text-forest-700'
                                  }`}
                                >
                                  {exp.dataTransferredMb} MB
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Dynamically Computed Research Takeaway */}
                  {dynamicTakeaways && (
                    <div className="mt-4 p-3 rounded bg-surface-subtle border border-border-subtle text-xs text-charcoal-700 space-y-1">
                      <div className="font-semibold text-charcoal-900 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-forest-700" />
                        Key Research Takeaway: Privacy vs. Accuracy Frontier
                      </div>
                      <p className="text-[11px] text-charcoal-600 leading-relaxed font-sans">
                        Sample-weighted FedAvg under Dirichlet Non-IID ({dynamicTakeaways.nonIidName}) achieves{' '}
                        <strong>{dynamicTakeaways.nonIidF1}% Macro F1</strong>, coming within{' '}
                        <strong>{dynamicTakeaways.f1Delta}%</strong> of the centralized baseline ({dynamicTakeaways.baselineF1}%)
                        while requiring <strong>{dynamicTakeaways.dataSavings}% less network data transmission</strong> ({dynamicTakeaways.nonIidEgress} MB vs {dynamicTakeaways.baselineEgress} MB)
                        and preserving raw IoT packet privacy.
                        {dynamicTakeaways.isolatedF1 && (
                          <>
                            {' '}Conversely, the isolated local client drops to{' '}
                            <strong>{dynamicTakeaways.isolatedF1}% F1</strong> due to zero exposure to attack patterns from other gateways.
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Selected Benchmark Deep-Dive */}
              {activeExp && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Confusion Matrix Panel */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Confusion Matrix</CardTitle>
                          <CardDescription>{activeExp.name}</CardDescription>
                        </div>
                        <Badge variant="forest">
                          {activeExp.confusionMatrix?.totalSamples
                            ? `Evaluated on ${activeExp.confusionMatrix.totalSamples.toLocaleString()} Flows`
                            : 'Evaluated Test Split'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ConfusionMatrix data={activeExp.confusionMatrix} />
                    </CardContent>
                  </Card>

                  {/* Per-Class Performance Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Per-Class Attack Detection Metrics</CardTitle>
                      <CardDescription>
                        Precision, recall, and F1 across specific IoT threat classes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto border border-border rounded">
                        <table className="w-full text-xs text-left font-mono border-collapse">
                          <thead>
                            <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-sans">
                              <th className="py-2 px-3">Class</th>
                              <th className="py-2 px-3">Precision</th>
                              <th className="py-2 px-3">Recall</th>
                              <th className="py-2 px-3">F1-Score</th>
                              <th className="py-2 px-3">FPR</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle bg-surface">
                            {activeExp.perClassPerformance.map(item => (
                              <tr key={item.className} className="hover:bg-surface-subtle/50">
                                <td className="py-2 px-3 font-semibold text-charcoal-900 font-sans">
                                  {item.className}
                                </td>
                                <td className="py-2 px-3 text-charcoal-800">
                                  {(item.precision * 100).toFixed(1)}%
                                </td>
                                <td className="py-2 px-3 text-charcoal-800">
                                  {(item.recall * 100).toFixed(1)}%
                                </td>
                                <td className="py-2 px-3 font-bold text-forest-800">
                                  {(item.f1Score * 100).toFixed(1)}%
                                </td>
                                <td className="py-2 px-3 text-charcoal-600">
                                  {(item.falsePositiveRate * 100).toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border-subtle flex justify-between text-xs font-mono text-charcoal-500">
                        <span>Overall Accuracy: {(activeExp.accuracy * 100).toFixed(2)}%</span>
                        <span>False Negative Rate: {(activeExp.falseNegativeRate * 100).toFixed(2)}%</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
