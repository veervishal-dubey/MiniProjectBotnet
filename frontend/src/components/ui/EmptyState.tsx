import React from 'react';
import { Database } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = <Database className="w-8 h-8 text-charcoal-400" />,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`border border-dashed border-border rounded p-8 sm:p-12 text-center bg-surface-subtle/30 flex flex-col items-center justify-center max-w-xl mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded bg-surface border border-border flex items-center justify-center mb-3 text-charcoal-500 shadow-subtle">
        {icon}
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-charcoal-800 tracking-tight">{title}</h3>
      <p className="text-xs sm:text-sm text-charcoal-500 max-w-md mt-1 leading-relaxed">
        {description}
      </p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {actionLabel && onAction && (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button size="sm" variant="outline" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
