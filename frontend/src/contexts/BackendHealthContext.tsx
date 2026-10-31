import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';
import { useToast } from '@/components/ui/Toast';

export type BackendHealthStatus = 'loading' | 'online' | 'offline' | 'error';

export interface BackendHealthContextType {
  status: BackendHealthStatus;
  isChecking: boolean;
  message: string;
  latencyMs: number | null;
  version?: string;
  databaseStatus?: string;
  databaseLatencyMs?: number | null;
  lastChecked: string | null;
  checkHealth: (overrideUrl?: string, isManual?: boolean) => Promise<BackendHealthStatus>;
}

const BackendHealthContext = createContext<BackendHealthContextType | undefined>(undefined);

export const BackendHealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { success, info, error: toastError } = useToast();
  const [status, setStatus] = useState<BackendHealthStatus>('loading');
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('Initializing FastAPI backend health check...');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [databaseStatus, setDatabaseStatus] = useState<string | undefined>(undefined);
  const [databaseLatencyMs, setDatabaseLatencyMs] = useState<number | null | undefined>(undefined);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkHealth = useCallback(
    async (overrideUrl?: string, isManual = false): Promise<BackendHealthStatus> => {
      setIsChecking(true);
      const configuredBase =
        overrideUrl ||
        storage.getSettings().backendApiUrl ||
        ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ? import.meta.env.VITE_API_BASE_URL : '') ||
        'http://localhost:8000';
      const cleanUrl = configuredBase.replace(/\/+$/, '');

      const start = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${cleanUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const elapsed = Math.round(performance.now() - start);

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const isHealthy = data.status === 'healthy' || data.status === 'degraded' || data.readiness?.backend === true;
          const newStatus: BackendHealthStatus = isHealthy ? 'online' : 'error';
          const serviceName = data.service || 'SentinelFL Backend';
          const ver = data.version || '1.0.0';
          const dbStat = data.database?.status;
          const dbLat = data.database?.latency_ms;

          setStatus(newStatus);
          setLatencyMs(elapsed);
          setVersion(ver);
          setDatabaseStatus(dbStat);
          setDatabaseLatencyMs(dbLat);

          const dbInfo = dbStat ? ` • Database: ${dbStat}` : '';
          const msg = `FastAPI responded in ${elapsed}ms (Status 200 OK) — ${serviceName} v${ver}${dbInfo}`;
          setMessage(msg);
          setLastChecked(new Date().toLocaleTimeString());

          if (isManual) {
            success('Backend Online', msg);
          }
          return newStatus;
        } else {
          const newStatus: BackendHealthStatus = 'error';
          setStatus(newStatus);
          setLatencyMs(elapsed);
          const msg = `FastAPI server returned HTTP ${res.status}: ${res.statusText}`;
          setMessage(msg);
          setLastChecked(new Date().toLocaleTimeString());

          if (isManual) {
            toastError('Backend Error', msg);
          }
          return newStatus;
        }
      } catch (err: unknown) {
        const newStatus: BackendHealthStatus = 'offline';
        setStatus(newStatus);
        setLatencyMs(null);
        setVersion(undefined);
        setDatabaseStatus(undefined);
        setDatabaseLatencyMs(undefined);

        let errorDetails = 'Connection refused';
        if (err instanceof Error) {
          if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            errorDetails = 'Request timed out after 8s';
          } else {
            errorDetails = err.message;
          }
        }
        const msg = `Cannot reach FastAPI server at ${cleanUrl}/health (${errorDetails}). Ensure local backend is running.`;
        setMessage(msg);
        setLastChecked(new Date().toLocaleTimeString());

        if (isManual) {
          info('Backend Offline', `Unable to connect to ${cleanUrl}/health. Make sure the FastAPI server is running.`);
        }
        return newStatus;
      } finally {
        setIsChecking(false);
      }
    },
    [success, info, toastError]
  );

  useEffect(() => {
    // Initial health check on mount
    checkHealth(undefined, false);

    // Dynamic heartbeat: fast 5s probe when offline to recover immediately, 30s when online
    const intervalTime = status === 'offline' ? 5000 : 30000;
    const interval = setInterval(() => {
      checkHealth(undefined, false);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [checkHealth, status]);

  return (
    <BackendHealthContext.Provider
      value={{
        status,
        isChecking,
        message,
        latencyMs,
        version,
        databaseStatus,
        databaseLatencyMs,
        lastChecked,
        checkHealth,
      }}
    >
      {children}
    </BackendHealthContext.Provider>
  );
};

export const useBackendHealth = () => {
  const context = useContext(BackendHealthContext);
  if (!context) {
    throw new Error('useBackendHealth must be used within a BackendHealthProvider');
  }
  return context;
};
