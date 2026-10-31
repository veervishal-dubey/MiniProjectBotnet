import React from 'react';
import { Info, AlertTriangle, Radio } from 'lucide-react';

interface DisclaimerBannerProps {
  type?: 'info' | 'backend-offline' | 'no-live-collector' | 'demo';
  message?: string;
  className?: string;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  type = 'info',
  message,
  className = '',
}) => {
  if (type === 'no-live-collector') {
    return (
      <div
        className={`bg-surface border-l-4 border-charcoal-400 border border-border-subtle p-3.5 rounded shadow-subtle flex items-start gap-3 ${className}`}
      >
        <Radio className="w-4 h-4 text-charcoal-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-charcoal-600">
          <span className="font-semibold text-charcoal-900 block sm:inline">
            Offline Batch Inference Mode:{' '}
          </span>
          {message ||
            'SentinelFL is operating on captured flow records. Real-time intrusion detection requires an attached libpcap/Zeek network flow sensor.'}
        </div>
      </div>
    );
  }

  if (type === 'backend-offline') {
    return (
      <div
        className={`bg-warmAmber-50/70 border border-warmAmber-200 p-3 rounded flex items-start gap-3 ${className}`}
      >
        <AlertTriangle className="w-4 h-4 text-warmAmber-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-warmAmber-900 flex-1">
          <span className="font-semibold block sm:inline">FastAPI Backend Disconnected: </span>
          {message ||
            'Running in offline mode. Connect to FastAPI backend at http://localhost:8000 to enable real-time inference and training.'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-surface border border-border p-3 rounded flex items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <Info className="w-4 h-4 text-forest-700 flex-shrink-0" />
        <div className="text-xs text-charcoal-700">
          {message || 'SentinelFL Federated IoT Threat Intelligence platform.'}
        </div>
      </div>
    </div>
  );
};
