import React from 'react';
import { Info, AlertTriangle, Radio } from 'lucide-react';
import { Badge } from './Badge';

interface DisclaimerBannerProps {
  type?: 'demo' | 'backend-offline' | 'no-live-collector';
  message?: string;
  className?: string;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  type = 'demo',
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
            'Running in frontend preview mode. Data operations and model simulations are performed locally in-browser.'}
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
          <span className="font-medium text-charcoal-900">Research Sandbox: </span>
          {message ||
            'Displaying curated IoT benchmark demonstration metrics (CICIoT2023 / BoT-IoT sample). Real executions connect to PyTorch FedAvg engine.'}
        </div>
      </div>
      <Badge variant="demo" size="sm">
        DEMO MODE
      </Badge>
    </div>
  );
};
