import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  mono?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  mono = false,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-charcoal-700 mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded border px-3 py-1.5 text-sm bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:bg-surface-subtle disabled:text-charcoal-400 ${
          error ? 'border-mutedRed-500 focus:ring-mutedRed-500' : 'border-border'
        } ${mono ? 'font-mono text-xs' : ''} ${className}`}
        {...props}
      />
      {error ? (
        <p className="text-xs text-mutedRed-600 mt-1">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-charcoal-500 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string | number; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-charcoal-700 mb-1">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded border px-3 py-1.5 text-sm bg-surface text-charcoal-900 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors ${
          error ? 'border-mutedRed-500 focus:ring-mutedRed-500' : 'border-border'
        } ${className}`}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-mutedRed-600 mt-1">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-charcoal-500 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};
