import React from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Network,
  Cpu,
  BarChart3,
  Sliders,
  Database,
  ArrowRight,
  Terminal,
  Lock,
  GitBranch,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-charcoal-900 font-sans selection:bg-forest-100 selection:text-forest-900">
      {/* Top Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-xs sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-forest-800 text-forest-100 flex items-center justify-center font-bold">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-charcoal-900 font-mono">
                SentinelFL
              </span>
              <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-forest-50 text-forest-800 border border-forest-200">
                Research Edition
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login">
              <Button size="sm" variant="ghost" className="text-xs">
                Sign In
              </Button>
            </Link>
            <Link to="/signup" className="hidden sm:inline-block">
              <Button size="sm" variant="secondary" className="text-xs">
                Register
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Open Platform
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 sm:py-24 border-b border-border bg-surface-subtle/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-forest-200 bg-forest-50 text-forest-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-forest-600 animate-pulse" />
            Empirical Cybersecurity Research Framework
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-charcoal-950 font-sans leading-tight">
            Federated IoT Threat Intelligence & Intrusion Detection
          </h1>

          <p className="text-sm sm:text-base text-charcoal-600 max-w-2xl mx-auto leading-relaxed">
            SentinelFL investigates collaborative botnet classification across distributed IoT silos
            using sample-weighted Federated Averaging (FedAvg), evaluating detection performance
            without centralizing raw network telemetry.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link to="/dashboard">
              <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Launch Research Workspace
              </Button>
            </Link>
            <Link to="/federated-learning">
              <Button size="lg" variant="secondary" leftIcon={<Network className="w-4 h-4 text-forest-700" />}>
                Inspect FedAvg Engine
              </Button>
            </Link>
          </div>

          {/* Technical Metadata Bar */}
          <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
            <div className="p-3 bg-surface rounded border border-border">
              <div className="text-[11px] text-charcoal-500 font-mono">Algorithm</div>
              <div className="text-xs font-semibold text-charcoal-900 mt-0.5">Sample-Weighted FedAvg</div>
            </div>
            <div className="p-3 bg-surface rounded border border-border">
              <div className="text-[11px] text-charcoal-500 font-mono">Simulated Silos</div>
              <div className="text-xs font-semibold text-charcoal-900 mt-0.5">Home, Industrial, Campus</div>
            </div>
            <div className="p-3 bg-surface rounded border border-border">
              <div className="text-[11px] text-charcoal-500 font-mono">Dataset Support</div>
              <div className="text-xs font-semibold text-charcoal-900 mt-0.5">CICIoT2023, BoT-IoT, N-BaIoT</div>
            </div>
            <div className="p-3 bg-surface rounded border border-border">
              <div className="text-[11px] text-charcoal-500 font-mono">Evaluation Mode</div>
              <div className="text-xs font-semibold text-charcoal-900 mt-0.5">IID vs Non-IID Dirichlet</div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Research Pillars */}
      <section className="py-16 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-charcoal-900 tracking-tight">
            Research Architecture & Investigation Scope
          </h2>
          <p className="text-xs sm:text-sm text-charcoal-500 mt-1.5 leading-relaxed">
            Engineered to compare centralized baseline algorithms against collaborative edge aggregation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded bg-forest-50 border border-forest-200 text-forest-800 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-charcoal-900">
                1. IoT Threat Classification
              </h3>
              <p className="text-xs text-charcoal-600 leading-relaxed">
                Evaluates detection of malicious IoT traffic vectors including Mirai UDP floods,
                DDoS SYN floods, Reconnaissance port scans, and HTTP denial-of-service flows.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono text-charcoal-500">
              <span>Task: Multi-Class</span>
              <span className="text-forest-700 font-medium">33 Flow Attributes</span>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded bg-forest-50 border border-forest-200 text-forest-800 flex items-center justify-center">
                <Network className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-charcoal-900">
                2. Collaborative Federated Training
              </h3>
              <p className="text-xs text-charcoal-600 leading-relaxed">
                Simulates 3 distinct network domains (Smart-Home, Industrial SCADA, Campus) performing
                local SGD optimization and transmitting only parameter weights to an aggregation coordinator.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono text-charcoal-500">
              <span>Aggregation: FedAvg</span>
              <span className="text-forest-700 font-medium">Dirichlet α=0.5</span>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded bg-forest-50 border border-forest-200 text-forest-800 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-charcoal-900">
                3. Comparative Evaluation
              </h3>
              <p className="text-xs text-charcoal-600 leading-relaxed">
                Rigorous side-by-side metric comparison between centralized baselines (Random Forest,
                Logistic Regression), federated global models, and isolated local client models.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono text-charcoal-500">
              <span>Metrics: F1, Acc, FPR</span>
              <span className="text-forest-700 font-medium">Confusion Heatmaps</span>
            </div>
          </Card>
        </div>

        {/* Workflow Pipeline */}
        <div className="mt-16 bg-surface border border-border rounded p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Layers className="w-4 h-4 text-forest-800" />
            <h3 className="text-sm font-semibold text-charcoal-900 uppercase tracking-wider">
              Research Pipeline Flow
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded bg-surface-subtle border border-border">
              <div className="text-[10px] font-mono text-charcoal-400">Step 01</div>
              <div className="font-semibold text-charcoal-900 mt-1">Dataset Ingestion</div>
              <p className="text-[11px] text-charcoal-500 mt-1">CSV upload & schema validation</p>
            </div>
            <div className="p-3 rounded bg-surface-subtle border border-border">
              <div className="text-[10px] font-mono text-charcoal-400">Step 02</div>
              <div className="font-semibold text-charcoal-900 mt-1">Feature Engineering</div>
              <p className="text-[11px] text-charcoal-500 mt-1">Scaling, splits & imbalance handling</p>
            </div>
            <div className="p-3 rounded bg-surface-subtle border border-border">
              <div className="text-[10px] font-mono text-charcoal-400">Step 03</div>
              <div className="font-semibold text-charcoal-900 mt-1">Baseline Training</div>
              <p className="text-[11px] text-charcoal-500 mt-1">Random Forest & Logistic Reg</p>
            </div>
            <div className="p-3 rounded bg-surface-subtle border border-border">
              <div className="text-[10px] font-mono text-charcoal-400">Step 04</div>
              <div className="font-semibold text-charcoal-900 mt-1">FedAvg Rounds</div>
              <p className="text-[11px] text-charcoal-500 mt-1">Multi-client weight aggregation</p>
            </div>
            <div className="p-3 rounded bg-surface-subtle border border-border">
              <div className="text-[10px] font-mono text-charcoal-400">Step 05</div>
              <div className="font-semibold text-charcoal-900 mt-1">Benchmark Audit</div>
              <p className="text-[11px] text-charcoal-500 mt-1">Confusion matrices & F1 curves</p>
            </div>
          </div>
        </div>

        {/* Honest Research Disclaimer */}
        <div className="mt-12 p-4 rounded bg-surface-subtle border border-border text-xs text-charcoal-600 flex items-start gap-3">
          <Terminal className="w-4 h-4 text-charcoal-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-charcoal-800">
              Research Transparency & Architectural Boundary Notice
            </p>
            <p className="text-charcoal-500 leading-relaxed">
              SentinelFL is an academic experimentation suite for offline flow records. The application does
              not claim live network packet capture unless an active libpcap/Zeek daemon is connected.
              In this development phase, the user interface operates in isolated frontend mode with
              transparent benchmark simulation demonstrations.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-charcoal-500 font-mono">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>SentinelFL • Federated IoT Threat Intelligence</span>
          <span>FastAPI + PyTorch + React + Vite</span>
        </div>
      </footer>
    </div>
  );
};
