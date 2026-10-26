import React from 'react';

export type BadgeVariant = 'neutral' | 'forest' | 'sage' | 'amber' | 'red' | 'outline' | 'demo';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
  dot = false,
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  const variantClasses: Record<BadgeVariant, { container: string; dotColor?: string }> = {
    neutral: {
      container: 'bg-charcoal-100 text-charcoal-700 border border-charcoal-200',
      dotColor: 'bg-charcoal-400',
    },
    forest: {
      container: 'bg-forest-50 text-forest-800 border border-forest-200',
      dotColor: 'bg-forest-600',
    },
    sage: {
      container: 'bg-sage-100 text-sage-800 border border-sage-300',
      dotColor: 'bg-sage-600',
    },
    amber: {
      container: 'bg-warmAmber-100 text-warmAmber-800 border border-warmAmber-300',
      dotColor: 'bg-warmAmber-600',
    },
    red: {
      container: 'bg-mutedRed-100 text-mutedRed-700 border border-mutedRed-300',
      dotColor: 'bg-mutedRed-500',
    },
    outline: {
      container: 'bg-transparent text-charcoal-600 border border-border',
      dotColor: 'bg-charcoal-400',
    },
    demo: {
      container: 'bg-warmAmber-50 text-warmAmber-800 border border-dashed border-warmAmber-400 font-mono tracking-tight',
      dotColor: 'bg-warmAmber-500',
    },
  };

  const current = variantClasses[variant] || variantClasses.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded ${sizeClasses} ${current.container} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.dotColor || 'bg-current'}`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};
