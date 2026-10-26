import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Network,
  Cpu,
  Layers,
  ArrowRight,
  ArrowDown,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Clock,
  Shield,
  Radio,
  FileText,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MetricCard } from '@/components/charts/MetricCard';
import { RoundsConvergenceChart } from '@/components/charts/RoundsConvergenceChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { storage } from '@/lib/storage';
import { FLExperiment, FLClient, PartitionStrategy } from '@/types/federated';

export const FederatedPage: React.FC = () => {
  const { isDemoMode } = useOutletContext<{ isDemoMode: boolean }>();
  const { success, info } = useToast();

  const [experiment, setExperiment] = useState<FLExperiment | null>(null);
  const [selectedClient, setSelectedClient] = useState<FLClient | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Form State for Experiment Config
  const [roundsTotal, setRoundsTotal] = useState(15);
  const [localEpochs, setLocalEpochs] = useState(3);
  const [partitionStrategy, setPartitionStrategy] = useState<PartitionStrategy>('non_iid_dirichlet');
  const [dirichletAlpha, setDirichletAlpha] = useState(0.5);
  const [learningRate, setLearningRate] = useState(0.01);
  const [batchSize, setBatchSize] = useState(64);
  const [randomSeed, setRandomSeed] = useState(42);

  const loadExperiment = () => {
    if (isDemoMode) {
      const exp = storage.getActiveExperiment();
      setExperiment(exp);
      if (exp.clients.length > 0 && !selectedClient) {
        setSelectedClient(exp.clients[0]);
      }
    } else {
      setExperiment(null);
      setSelectedClient(null);
    }
  };

  useEffect(() => {
    loadExperiment();
    window.addEventListener('sentinelfl:demomode-change', loadExperiment);
    return () => window.removeEventListener('sentinelfl:demomode-change', loadExperiment);
  }, [isDemoMode]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!experiment) return;

    const updated: FLExperiment = {
      ...experiment,
      roundsTotal,
      partitionStrategy,
      dirichletAlpha,
      learningRate,
      batchSize,
      randomSeed,
      clients: experiment.clients.map(c => ({ ...c, localEpochs })),
    };

    storage.saveActiveExperiment(updated);
    setExperiment(updated);
    setIsConfigModalOpen(false);
    success(
      'Federated Parameters Updated',
      `Configured ${roundsTotal} FedAvg communication rounds with Dirichlet α=${dirichletAlpha}.`
    );
  };

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="demo"
        message="Simulating collaborative edge training across 3 distinct IoT device silos. In Phase 2, this interface dispatches to genuine PyTorch sample-weighted FedAvg."
      />

      {/* Header with Title and Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-charcoal-900 tracking-tight font-sans">
              Federated Learning Orchestration Engine
            </h2>
            <Badge variant="forest">FedAvg Protocol</Badge>
          </div>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Sample-Weighted FedAvg: w_{'{t+1}'} = Σ (n_k / N) · w_{'{t+1}'}^k across simulated edge silos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Sliders className="w-3.5 h-3.5" />}
            onClick={() => setIsConfigModalOpen(true)}
          >
            Configure Experiment
          </Button>
        </div>
      </div>

      {!experiment ? (
        <EmptyState
          title="No Active Federated Experiment"
          description="There is no active FedAvg training run. Enable Demonstration Mode to explore a 15-round multi-client simulation or configure a new experiment run."
          actionLabel="Enable Demonstration Mode"
          onAction={() => {
            const s = storage.getSettings();
            s.useDemoData = true;
            storage.saveSettings(s);
            window.location.reload();
          }}
          secondaryActionLabel="Open Settings"
          onSecondaryAction={() => window.location.assign('/settings')}
        />
      ) : (
        <>
          {/* Key FL Telemetry Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Completed Communication"
              value={`Round ${experiment.currentRound}/${experiment.roundsTotal}`}
              subValue="100% Client Participation"
              badge={{ text: 'Converged', variant: 'forest' }}
              icon={<Network className="w-4 h-4" />}
              hint="15 Rounds of Aggregation"
            />

            <MetricCard
              label="Global Model F1"
              value={`${( (experiment.roundsHistory[experiment.roundsHistory.length - 1]?.globalF1 || 0.96) * 100).toFixed(1)}%`}
              subValue="Macro Average"
              badge={{ text: 'vs 97.5% Centralized', variant: 'sage' }}
              icon={<Cpu className="w-4 h-4" />}
              hint="Privacy Penalty: -1.5% F1"
            />

            <MetricCard
              label="Cross-Entropy Loss"
              value={experiment.roundsHistory[experiment.roundsHistory.length - 1]?.globalLoss.toFixed(3) || '0.114'}
              subValue="Global Evaluation"
              badge={{ text: '-82% vs Round 1', variant: 'forest' }}
              icon={<Radio className="w-4 h-4" />}
              hint="Initial Loss: 0.642"
            />

            <MetricCard
              label="Data Egress Overhead"
              value="4.8 MB"
              subValue="Model Weights Only"
              badge={{ text: '96.7% Data Saved', variant: 'forest' }}
              icon={<Shield className="w-4 h-4" />}
              hint="Raw Data Avoided: 148 MB"
            />
          </div>

          {/* Interactive Technical FedAvg Flow Architecture Diagram */}
          <Card className="p-5 overflow-hidden">
            <CardHeader className="p-0 pb-4 border-b border-border-subtle">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">FedAvg Aggregation Architecture & Data Flow</CardTitle>
                  <CardDescription>
                    Raw network flows remain strictly on edge clients. Only weight tensors are exchanged with the coordinator.
                  </CardDescription>
                </div>
                <span className="text-[11px] font-mono text-charcoal-400">
                  Partition: {experiment.partitionStrategy} (α={experiment.dirichletAlpha})
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-0 pt-6">
              {/* Architecture Visualization Flow */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative">
                {/* 3 Edge Clients */}
                {experiment.clients.map((client, idx) => (
                  <div
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className={`p-4 rounded border cursor-pointer transition-all ${
                      selectedClient?.id === client.id
                        ? 'border-forest-600 bg-forest-50/50 shadow-sm'
                        : 'border-border bg-surface hover:bg-surface-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-charcoal-100 text-charcoal-700">
                        CLIENT {idx + 1}
                      </span>
                      <Badge variant="forest" size="sm" dot>
                        SYNCED
                      </Badge>
                    </div>

                    <h4 className="text-xs font-bold text-charcoal-900 tracking-tight">
                      {client.name}
                    </h4>
                    <p className="text-[11px] text-charcoal-500 font-mono mt-0.5 truncate">
                      {client.simulatedEnvironment}
                    </p>

                    <div className="mt-3 pt-2 border-t border-border-subtle space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-charcoal-500 font-sans">Sample Count:</span>
                        <span className="font-semibold">{client.sampleCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoal-500 font-sans">Weight (n_k/N):</span>
                        <span className="text-forest-800 font-semibold">
                          {(client.sampleWeight * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoal-500 font-sans">Local Accuracy:</span>
                        <span className="font-semibold text-charcoal-900">
                          {((client.localAccuracy || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] text-charcoal-400 font-mono truncate">
                      Devices: {client.deviceTypes.join(', ')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Central FedAvg Aggregator Card */}
              <div className="mt-4 p-4 rounded bg-surface-dark text-white border border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-forest-800 text-forest-200 flex items-center justify-center font-bold">
                    Σ
                  </div>
                  <div>
                    <div className="font-bold text-forest-300">
                      FedAvg Parameter Aggregator Coordinator
                    </div>
                    <div className="text-[11px] text-charcoal-400">
                      w_global = 0.258 · w_home + 0.589 · w_industrial + 0.153 · w_campus
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px]">
                  <div>
                    <span className="text-charcoal-400 block font-sans text-[10px]">Active Checkpoint</span>
                    <span className="text-white font-semibold">fedavg_round15_global.pt</span>
                  </div>
                  <div>
                    <span className="text-charcoal-400 block font-sans text-[10px]">Delta Norm</span>
                    <span className="text-forest-400 font-semibold">||Δw|| = 0.0142</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Convergence Chart & Communication Rounds Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Training Dynamics over Communication Rounds</CardTitle>
                    <CardDescription>
                      Empirical progression of global loss reduction and macro accuracy.
                    </CardDescription>
                  </div>
                  <Badge variant="sage">15 Rounds Total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <RoundsConvergenceChart roundsHistory={experiment.roundsHistory} />
              </CardContent>
            </Card>

            {/* Selected Client Deep-Dive Panel */}
            <Card>
              <CardHeader>
                <span className="text-[11px] text-charcoal-500 font-mono">SELECTED CLIENT SILO</span>
                <CardTitle className="mt-1">
                  {selectedClient?.name || 'Client Details'}
                </CardTitle>
                <CardDescription>
                  {selectedClient?.simulatedEnvironment}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs font-mono">
                {selectedClient ? (
                  <>
                    <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-2">
                      <div className="flex justify-between py-1 border-b border-border-subtle">
                        <span className="text-charcoal-500 font-sans">Dominant Attack:</span>
                        <span className="font-semibold text-mutedRed-600 truncate max-w-[130px]">
                          {selectedClient.dominantAttackClass}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border-subtle">
                        <span className="text-charcoal-500 font-sans">Sample Weight:</span>
                        <span className="font-semibold text-forest-800">
                          {(selectedClient.sampleWeight * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border-subtle">
                        <span className="text-charcoal-500 font-sans">Local Epochs / Round:</span>
                        <span className="font-semibold text-charcoal-900">{selectedClient.localEpochs}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-charcoal-500 font-sans">Local Cross-Entropy:</span>
                        <span className="font-semibold text-charcoal-900">{selectedClient.localLoss}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-charcoal-800 font-sans mb-1">
                        Simulated IoT Devices in Domain:
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedClient.deviceTypes.map(dev => (
                          <span
                            key={dev}
                            className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-charcoal-700 font-sans"
                          >
                            {dev}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-forest-50 border border-forest-200 text-forest-900 font-sans text-[11px] leading-relaxed">
                      <strong>Privacy Guarantee:</strong> This edge silo processes local network packet flows
                      strictly on-device. Only model weights are transmitted.
                    </div>
                  </>
                ) : (
                  <p className="text-charcoal-400 font-sans">Select a client above.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Aggregation Rounds History Audit Table */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle>Communication Rounds Log</CardTitle>
                <CardDescription>
                  Detailed breakdown of each FedAvg aggregation epoch.
                </CardDescription>
              </div>
              <span className="text-xs font-mono text-charcoal-500">
                {experiment.roundsHistory.length} checkpoints recorded
              </span>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border border-border rounded">
                <table className="w-full text-xs text-left font-mono border-collapse">
                  <thead>
                    <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans">
                      <th className="py-2.5 px-3">Round</th>
                      <th className="py-2.5 px-3">Global Loss</th>
                      <th className="py-2.5 px-3">Global Accuracy</th>
                      <th className="py-2.5 px-3">Global F1-Score</th>
                      <th className="py-2.5 px-3">Active Clients</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle bg-surface">
                    {experiment.roundsHistory.map(round => (
                      <tr key={round.round} className="hover:bg-surface-subtle/60 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-charcoal-900">
                          Round {round.round}
                        </td>
                        <td className="py-2.5 px-3 text-warmAmber-700">
                          {round.globalLoss.toFixed(3)}
                        </td>
                        <td className="py-2.5 px-3 text-charcoal-800">
                          {(round.globalAccuracy * 100).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-forest-800">
                          {(round.globalF1 * 100).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-charcoal-700">
                          {round.activeClientsCount} / 3 Clients
                        </td>
                        <td className="py-2.5 px-3 text-charcoal-600">
                          {round.durationSeconds}s
                        </td>
                        <td className="py-2.5 px-3 text-charcoal-400 text-[11px]">
                          {new Date(round.aggregatedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Configure Experiment Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Configure Federated Learning Experiment"
        description="Set hyperparameter parameters for simulated clients and FedAvg aggregation."
        maxWidth="md"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Communication Rounds"
              type="number"
              min="1"
              max="100"
              value={roundsTotal}
              onChange={e => setRoundsTotal(Number(e.target.value))}
            />
            <Input
              label="Local Epochs per Round"
              type="number"
              min="1"
              max="20"
              value={localEpochs}
              onChange={e => setLocalEpochs(Number(e.target.value))}
            />
          </div>

          <Select
            label="Data Partitioning Strategy"
            value={partitionStrategy}
            onChange={e => setPartitionStrategy(e.target.value as PartitionStrategy)}
            options={[
              { value: 'non_iid_dirichlet', label: 'Non-IID (Dirichlet Distribution α=0.5)' },
              { value: 'iid', label: 'IID (Uniform Random Distribution)' },
              { value: 'non_iid_device', label: 'Non-IID (Partition by Device Silo)' },
            ]}
          />

          {partitionStrategy === 'non_iid_dirichlet' && (
            <Input
              label="Dirichlet Alpha (Heterogeneity Parameter α)"
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={dirichletAlpha}
              onChange={e => setDirichletAlpha(Number(e.target.value))}
              helperText="Smaller α represents higher non-IID class skew across clients."
            />
          )}

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Learning Rate"
              type="number"
              step="0.005"
              value={learningRate}
              onChange={e => setLearningRate(Number(e.target.value))}
            />
            <Input
              label="Batch Size"
              type="number"
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
            />
            <Input
              label="Random Seed"
              type="number"
              value={randomSeed}
              onChange={e => setRandomSeed(Number(e.target.value))}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-border-subtle">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfigModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary">
              Save Parameters
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
