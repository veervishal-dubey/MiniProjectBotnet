import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Terminal,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Layers,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { storage } from '@/lib/storage';
import { LogEntry, LogSeverity, LogCategory } from '@/types/logs';

export const LogsPage: React.FC = () => {
  const { isDemoMode } = useOutletContext<{ isDemoMode: boolean }>();
  const { success, info } = useToast();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | LogSeverity>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | LogCategory>('ALL');

  const loadLogs = () => {
    const list = storage.getLogs(isDemoMode);
    setLogs(list);
  };

  useEffect(() => {
    loadLogs();
    window.addEventListener('sentinelfl:demomode-change', loadLogs);
    return () => window.removeEventListener('sentinelfl:demomode-change', loadLogs);
  }, [isDemoMode]);

  const handleDownloadLogs = () => {
    const text = JSON.stringify(logs, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinelfl_audit_logs_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    success('Logs Downloaded', 'Audit log file saved to your device.');
  };

  const filteredLogs = logs.filter(log => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      log.message.toLowerCase().includes(q) ||
      log.component.toLowerCase().includes(q) ||
      log.category.toLowerCase().includes(q);

    const matchSev = severityFilter === 'ALL' || log.severity === severityFilter;
    const matchCat = categoryFilter === 'ALL' || log.category === categoryFilter;

    return matchSearch && matchSev && matchCat;
  });

  const getSeverityBadge = (sev: LogSeverity) => {
    switch (sev) {
      case 'INFO':
        return <Badge variant="forest" size="sm">INFO</Badge>;
      case 'WARN':
        return <Badge variant="amber" size="sm">WARN</Badge>;
      case 'ERROR':
        return <Badge variant="red" size="sm">ERROR</Badge>;
      case 'DEBUG':
        return <Badge variant="neutral" size="sm">DEBUG</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <DisclaimerBanner
        type="demo"
        message="System audit logs record data ingestion, training checkpoints, and inference events. Demonstration logs are explicitly tagged."
      />

      {/* Filter and Search Bar */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="w-3.5 h-3.5 text-charcoal-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search logs by message, component, or keyword..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-charcoal-900"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={handleDownloadLogs}
            >
              Export JSON
            </Button>
          </div>
        </div>

        {/* Severity & Category Chips */}
        <div className="mt-3 pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-charcoal-500 font-mono mr-1">Severity:</span>
            {(['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  severityFilter === sev
                    ? 'bg-charcoal-900 text-white font-semibold'
                    : 'bg-surface-subtle text-charcoal-600 hover:bg-charcoal-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-charcoal-500 font-mono mr-1">Category:</span>
            {(['ALL', 'FEDERATED', 'DETECTION', 'TRAINING', 'DATASET', 'SYSTEM'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  categoryFilter === cat
                    ? 'bg-forest-900 text-forest-100 font-semibold'
                    : 'bg-surface-subtle text-charcoal-600 hover:bg-charcoal-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      {filteredLogs.length === 0 ? (
        <EmptyState
          title="No Logs Found"
          description="No log events match your active search and severity filters."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchQuery('');
            setSeverityFilter('ALL');
            setCategoryFilter('ALL');
          }}
        />
      ) : (
        <div className="overflow-x-auto border border-border rounded bg-surface shadow-subtle">
          <table className="w-full text-xs text-left font-mono border-collapse">
            <thead>
              <tr className="bg-surface-subtle border-b border-border text-charcoal-600 font-medium font-sans">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Component</th>
                <th className="py-2.5 px-3">Message</th>
                <th className="py-2.5 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface">
              {filteredLogs.map(log => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-surface-subtle/70 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3 text-charcoal-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    {getSeverityBadge(log.severity)}
                  </td>
                  <td className="py-2.5 px-3 text-charcoal-700">
                    <span className="px-1.5 py-0.5 rounded bg-surface-subtle text-[11px]">
                      {log.category}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-charcoal-900 font-semibold">
                    {log.component}
                  </td>
                  <td className="py-2.5 px-3 text-charcoal-800 font-sans truncate max-w-md">
                    {log.isSyntheticDemo && (
                      <span className="text-[10px] font-mono text-warmAmber-700 mr-1.5 font-bold">
                        [DEMO]
                      </span>
                    )}
                    <span>{log.message}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={() => setSelectedLog(log)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Detail Drawer */}
      <Drawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Log Event Details"
        subtitle={`Event ID: ${selectedLog?.id || ''}`}
        width="md"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs font-mono">
            <div className="flex items-center justify-between p-3 rounded bg-surface border border-border">
              <span className="font-sans font-semibold text-charcoal-900">Severity</span>
              {getSeverityBadge(selectedLog.severity)}
            </div>

            <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-2">
              <div className="flex justify-between">
                <span className="text-charcoal-500 font-sans">Timestamp:</span>
                <span className="text-charcoal-900">{selectedLog.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-500 font-sans">Category:</span>
                <span className="text-charcoal-900">{selectedLog.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-500 font-sans">Component:</span>
                <span className="text-charcoal-900">{selectedLog.component}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-charcoal-900 font-sans uppercase tracking-wider mb-1">
                Log Message
              </h4>
              <p className="p-3 rounded bg-surface border border-border text-charcoal-800 font-sans leading-relaxed">
                {selectedLog.message}
              </p>
            </div>

            {selectedLog.details && (
              <div>
                <h4 className="text-xs font-semibold text-charcoal-900 font-sans uppercase tracking-wider mb-1">
                  Structured Payload Metadata
                </h4>
                <pre className="p-3 rounded bg-surface-subtle border border-border text-[11px] overflow-x-auto text-charcoal-900">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
