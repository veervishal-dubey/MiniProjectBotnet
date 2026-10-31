import React, { useState, useEffect, useMemo } from 'react';
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
  const { success, info } = useToast();
  const { activeDataset, activeDatasetId } = useActiveDataset();

  // Active Tab: 'active-dataset' vs 'benchmarks'
  const [activeTab, setActiveTab] = useState<'active-dataset' | 'benchmarks'>('active-dataset');

  // Active dataset evaluation metrics from backend
  const [datasetEval, setDatasetEval] = useState<any | null>(null);
  const [isLoadingDatasetEval, setIsLoadingDatasetEval] = useState<boolean>(false);

  // Historical benchmarks
  const [experiments, setExperiments] = useState<EvaluationExperiment[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string>('eval-fedavg-iid');
  const [isLoadingBenchmarks, setIsLoadingBenchmarks] = useState(true);

  // Load benchmarks
  useEffect(() => {
    const loadBenchmarks = async () => {
      setIsLoadingBenchmarks(true);
      try {
        const { data: bench } = await apiClient.getEvaluationExperiments();
        if (bench && bench.length > 0) {
          setExperiments(bench);
          setActiveExperimentId(bench[0]?.id || 'eval-fedavg-iid');
        } else {
          setExperiments([]);
        }
      } catch (err) {
        console.warn('Could not load benchmarks from backend:', err);
        setExperiments([]);
      } finally {
        setIsLoadingBenchmarks(false);
      }
    };
    loadBenchmarks();
  }, []);

  // Fetch active dataset evaluation whenever activeDataset changes
  useEffect(() => {
    let isMounted = true;
    async function loadDatasetEvaluation() {
      if (!activeDatasetId) {
        setDatasetEval(null);
        return;
      }
      setIsLoadingDatasetEval(true);
      try {
        const data = await apiClient.getDatasetEvaluation(activeDatasetId);
        if (isMounted) {
          setDatasetEval(data);
        }
      } catch (err) {
        console.warn('Failed to load active dataset evaluation:', err);
        if (isMounted) setDatasetEval(null);
      } finally {
        if (isMounted) setIsLoadingDatasetEval(false);
      }
    }
    loadDatasetEvaluation();
    return () => {
      isMounted = false;
    };
  }, [activeDatasetId]);

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
    if (!datasetEval?.confusion_matrix) return null;
    const cm = datasetEval.confusion_matrix;
    return {
      classes: cm.classes || [],
      matrix: cm.matrix || [],
      totalSamples: datasetEval.evaluated_samples || datasetEval.total_flows || 0,
      accuracy: datasetEval.accuracy || 0,
    };
  }, [datasetEval]);

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="info"
        message="Evaluation Workspace: Review empirical benchmark comparisons across Centralized ML and collaborative FedAvg (175,669 historical test flows) or inspect real-time validation metrics computed directly on your active workspace dataset."
      />

      {/* Persistent Global Active Dataset Selector */}
      <ActiveDatasetSelector />

      {/* Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-1">
        <Tabs
          tabs={[
            {
              id: 'active-dataset',
              label: 'Current Active Dataset Evaluation',
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

      {/* TAB 1: Current Active Dataset Evaluation */}
      {activeTab === 'active-dataset' && (
        <div className="space-y-6">
          {!activeDataset ? (
            <EmptyState
              title="No Active Dataset Selected"
              description="Select an active dataset above to view its ground-truth classification evaluation metrics."
              actionLabel="Go to Datasets"
              onAction={() => navigate('/datasets')}
            />
          ) : isLoadingDatasetEval ? (
            <Card className="p-8 text-center text-charcoal-500">
              <span className="text-sm font-medium">Loading evaluation metrics for "{activeDataset.name}"...</span>
            </Card>
          ) : !datasetEval || !datasetEval.has_ground_truth ? (
            <EmptyState
              title={`No Evaluation Metrics Available for "${activeDataset.name}"`}
              description={
                datasetEval && !datasetEval.has_ground_truth
                  ? `Active dataset "${activeDataset.name}" does not contain recognized ground-truth labels. Metrics and confusion matrices require actual labels to evaluate predictions.`
                  : `Active dataset "${activeDataset.name}" has not been classified yet. Run Flow Detection on this dataset to automatically compute classification metrics, confusion matrices, and per-class performance.`
              }
              actionLabel="Classify Active Dataset in Flow Detection"
              onAction={() => navigate('/detection')}
            />
          ) : (
            <>
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-charcoal-900 font-sans">
                    Dataset Evaluation: {datasetEval.dataset_name || activeDataset.name}
                  </h3>
                  <p className="text-xs text-charcoal-500 font-mono mt-0.5">
                    Evaluated on {datasetEval.evaluated_samples?.toLocaleString()} valid flows • Model: {datasetEval.model_version || 'FLMLP-v2.1'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="forest" size="sm" dot>
                    Ground-Truth Verified
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/detection')}
                  >
                    View All Predictions
                  </Button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Accuracy
                  </span>
                  <div className="text-lg font-bold text-forest-800 font-mono mt-0.5">
                    {(datasetEval.accuracy * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Macro Precision
                  </span>
                  <div className="text-lg font-bold text-charcoal-900 font-mono mt-0.5">
                    {(datasetEval.macro_precision * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Macro Recall
                  </span>
                  <div className="text-lg font-bold text-charcoal-900 font-mono mt-0.5">
                    {(datasetEval.macro_recall * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    Macro F1-Score
                  </span>
                  <div className="text-lg font-bold text-forest-800 font-mono mt-0.5">
                    {(datasetEval.macro_f1 * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    False Positive Rate
                  </span>
                  <div className="text-lg font-bold text-charcoal-700 font-mono mt-0.5">
                    {(datasetEval.false_positive_rate * 100).toFixed(2)}%
                  </div>
                </Card>

                <Card className="p-3 text-center">
                  <span className="text-[10px] text-charcoal-500 uppercase tracking-wider block font-sans">
                    False Negative Rate
                  </span>
                  <div className="text-lg font-bold text-charcoal-700 font-mono mt-0.5">
                    {(datasetEval.false_negative_rate * 100).toFixed(2)}%
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
                        <CardTitle>Confusion Matrix (7x7)</CardTitle>
                        <CardDescription>
                          Evaluated against actual ground-truth labels in "{activeDataset.name}".
                        </CardDescription>
                      </div>
                      <Badge variant="forest">
                        {datasetEval.evaluated_samples?.toLocaleString()} Flows
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
                          {(datasetEval.per_class_performance || []).map((item: any) => (
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
                                {((item.f1Score || item.f1_score || 0) * 100).toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-charcoal-600">
                                {((item.falsePositiveRate || item.fpr || 0) * 100).toFixed(2)}%
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
