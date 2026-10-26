import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { storage } from '@/lib/storage';
import { useToast } from '@/components/ui/Toast';

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return storage.getSettings().useDemoData;
  });
  const location = useLocation();
  const { info } = useToast();

  const handleToggleDemoMode = () => {
    const updated = !isDemoMode;
    setIsDemoMode(updated);
    const settings = storage.getSettings();
    settings.useDemoData = updated;
    storage.saveSettings(settings);

    // Force re-render of components listening to demo mode
    window.dispatchEvent(new Event('sentinelfl:demomode-change'));

    if (updated) {
      info('Demonstration Mode Active', 'Loaded benchmark datasets (CICIoT2023, BoT-IoT) and simulated experiments.');
    } else {
      info('Demonstration Mode Inactive', 'Showing only pristine user-created datasets and pending experiments.');
    }
  };

  const pageMeta: Record<string, { title: string; description: string }> = {
    '/dashboard': {
      title: 'Security & Experiment Overview',
      description: 'Centralized posture, federated learning status, and IoT threat detection telemetry.',
    },
    '/datasets': {
      title: 'Dataset Management & Schema Inspection',
      description: 'Upload, inspect, and preview IoT network traffic captures (CICIoT2023, BoT-IoT, N-BaIoT).',
    },
    '/preprocessing': {
      title: 'Data Preparation & Preprocessing Pipeline',
      description: 'Configure feature selection, scaling, split ratios, and class-imbalance resolution.',
    },
    '/models': {
      title: 'Model Registry & Centralized Baselines',
      description: 'Manage centralized machine learning models (Random Forest, Logistic Regression) and federated models.',
    },
    '/federated-learning': {
      title: 'Federated Learning Orchestration (FedAvg)',
      description: 'Collaborative model training across Smart-Home, Industrial, and Campus IoT simulated nodes.',
    },
    '/detection': {
      title: 'Network Flow Intrusion Detection',
      description: 'Run batch inference across network flow records to classify benign and malicious botnet traffic.',
    },
    '/evaluation': {
      title: 'Research Evaluation & Benchmark Metrics',
      description: 'Compare Centralized ML, Federated FedAvg (IID vs non-IID), and local siloed models.',
    },
    '/logs': {
      title: 'System & Experiment Audit Logs',
      description: 'Searchable structured logs across dataset I/O, training rounds, and detection events.',
    },
    '/settings': {
      title: 'Platform Configuration & Backend Readiness',
      description: 'Manage research parameters, local caching, and future Supabase/FastAPI connection credentials.',
    },
  };

  const currentMeta = pageMeta[location.pathname] || {
    title: 'SentinelFL',
    description: 'Federated IoT Threat Intelligence Platform',
  };

  return (
    <div className="flex h-screen bg-background text-charcoal-900 overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDemoMode={isDemoMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav
          onMenuClick={() => setSidebarOpen(true)}
          title={currentMeta.title}
          description={currentMeta.description}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet context={{ isDemoMode }} />
          </div>
        </main>
      </div>
    </div>
  );
};
