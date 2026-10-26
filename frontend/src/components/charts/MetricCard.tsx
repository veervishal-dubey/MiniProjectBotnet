import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  badge?: {
    text: string;
    variant: 'neutral' | 'forest' | 'sage' | 'amber' | 'red';
  };
  icon?: React.ReactNode;
  hint?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  badge,
  icon,
  hint,
  className = '',
}) => {
  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wider">{label}</p>
        {icon && <div className="text-charcoal-400 p-1 rounded bg-surface-subtle">{icon}</div>}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-charcoal-900 font-mono">
          {value}
        </span>
        {subValue && <span className="text-xs text-charcoal-500 font-mono">{subValue}</span>}
      </div>

      {(badge || hint) && (
        <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-border-subtle">
          {badge && (
            <Badge variant={badge.variant} size="sm">
              {badge.text}
            </Badge>
          )}
          {hint && <span className="text-[11px] text-charcoal-400 truncate">{hint}</span>}
        </div>
      )}
    </Card>
  );
};
