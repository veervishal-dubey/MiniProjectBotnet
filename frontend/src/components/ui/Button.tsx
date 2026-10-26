import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
    md: 'text-sm px-3.5 py-2 gap-2 h-9',
    lg: 'text-sm px-4 py-2.5 gap-2.5 h-11 font-semibold',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-forest-800 text-white hover:bg-forest-700 active:bg-forest-900 border border-forest-900 focus-visible:ring-forest-700 shadow-subtle',
    secondary:
      'bg-surface text-charcoal-800 hover:bg-surface-subtle active:bg-surface-muted border border-border focus-visible:ring-forest-600 shadow-subtle',
    outline:
      'bg-transparent text-charcoal-700 hover:bg-surface-subtle border border-border focus-visible:ring-forest-600',
    ghost:
      'bg-transparent text-charcoal-700 hover:bg-charcoal-100 active:bg-charcoal-200 focus-visible:ring-forest-600',
    danger:
      'bg-mutedRed-600 text-white hover:bg-mutedRed-700 active:bg-mutedRed-800 border border-mutedRed-700 focus-visible:ring-mutedRed-500 shadow-subtle',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
};
