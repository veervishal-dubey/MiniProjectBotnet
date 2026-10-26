import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'xl',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-3xl',
  }[width];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      <div
        className="fixed inset-0 bg-charcoal-950/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className={`w-screen ${widthClasses} bg-surface border-l border-border shadow-modal flex flex-col`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-surface-subtle/50">
            <div>
              <h2 className="text-base font-semibold text-charcoal-900 tracking-tight">{title}</h2>
              {subtitle && <p className="text-xs text-charcoal-500 font-mono mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-charcoal-400 hover:text-charcoal-700 p-1.5 rounded hover:bg-charcoal-200/50 transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  );
};
