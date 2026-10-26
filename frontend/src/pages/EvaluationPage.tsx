import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfusionMatrix } from '@/components/charts/ConfusionMatrix';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { DEMO_EVALUATION_EXPERIMENTS } from '@/api/mockData';
import { EvaluationExperiment } from '@/types/evaluation';

export const EvaluationPage: React.FC = () => {
  const { isDemoMode } = useOutletContext<{ isDemoMode: boolean }>();
  const { success, info } = useToast();

  const [experiments, setExperiments] = useState<EvaluationExperiment[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string>('eval-fedavg-non-iid');

  useEffect(() => {
    if (isDemoMode) {
      setExperiments(DEMO_EVALUATION_EXPERIMENTS);
      setActiveExperimentId(DEMO_EVALUATION_EXPERIMENTS[2]?.id || 'eval-fedavg-non-iid');
    } else {
      setExperiments([]);
    }
  }, [isDemoMode]);

  const activeExp = experiments.find(e => e.id === activeExperimentId) || experiments[0];

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

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="demo"
        message="Evaluation workspace displays empirical benchmark metrics comparing centralized baselines with sample-weighted FedAvg under IID and non-IID Dirichlet splits."
      />

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-charcoal-900 tracking-tight font-sans">
            Comparative Benchmark & Research Evaluation
          </h2>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Statistical tradeoff analysis: Centralized ML vs. Collaborative FedAvg vs. Isolated Edge Silos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyMarkdown}
          >
            Copy Markdown Table
          </Button>
        </div>
      </div>

      {!isDemoMode || experiments.length === 0 ? (
        <EmptyState
          title="No Evaluation Results Available"
          description="Evaluation comparisons require completed training experiments. Turn on Demonstration Mode to view the full empirical benchmark suite."
          actionLabel="Turn on Demo Mode"
          onAction={() => {
            const s = JSON.parse(localStorage.getItem('sentinelfl_settings') || '{}');
            s.useDemoData = true;
            localStorage.setItem('sentinelfl_settings', JSON.stringify(s));
            window.location.reload();
          }}
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
                          <td className="py-3 px-3 text-charcoal-700">
                            {exp.modelArchitecture}
                          </td>
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

              {/* Research Insights Banner */}
              <div className="mt-4 p-3 rounded bg-surface-subtle border border-border-subtle text-xs text-charcoal-700 space-y-1">
                <div className="font-semibold text-charcoal-900 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-forest-700" />
                  Key Research Takeaway: Privacy vs. Accuracy Frontier
                </div>
                <p className="text-[11px] text-charcoal-600 leading-relaxed font-sans">
                  Sample-weighted FedAvg under Dirichlet Non-IID (α=0.5) achieves <strong>95.97% Macro F1</strong>,
                  coming within <strong>1.53%</strong> of the centralized baseline (97.50%) while requiring
                  <strong> 96.7% less network data transmission</strong> and preserving IoT raw packet privacy.
                  Conversely, the isolated local client drops to <strong>87.00% F1</strong> due to zero exposure
                  to industrial IoT attack signatures.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Deep-Dive Grid: Confusion Matrix & Per-Class Breakdown */}
          {activeExp && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Confusion Matrix Panel */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Confusion Matrix</CardTitle>
                      <CardDescription>
                        {activeExp.name}
                      </CardDescription>
                    </div>
                    <Badge variant="forest">Evaluated on 6,000 Flows</Badge>
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
  );
};
