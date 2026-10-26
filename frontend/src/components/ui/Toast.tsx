import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastItem = { ...toast, id };
    setToasts(prev => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const success = useCallback((title: string, message?: string) => {
    showToast({ type: 'success', title, message });
  }, [showToast]);

  const error = useCallback((title: string, message?: string) => {
    showToast({ type: 'error', title, message });
  }, [showToast]);

  const info = useCallback((title: string, message?: string) => {
    showToast({ type: 'info', title, message });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded border shadow-modal bg-surface flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'border-forest-200 text-charcoal-900'
                : toast.type === 'error'
                ? 'border-mutedRed-200 text-charcoal-900'
                : 'border-border text-charcoal-900'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-forest-700 flex-shrink-0 mt-0.5" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-mutedRed-600 flex-shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-charcoal-600 flex-shrink-0 mt-0.5" />}
            {toast.type === 'warning' && <AlertCircle className="w-4 h-4 text-warmAmber-600 flex-shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-none">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-charcoal-500 mt-1 leading-relaxed">{toast.message}</p>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-charcoal-400 hover:text-charcoal-700 p-0.5 rounded transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
