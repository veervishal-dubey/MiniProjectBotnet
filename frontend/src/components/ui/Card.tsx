import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  isDark?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', isDark = false, ...props }) => {
  return (
    <div
      className={`rounded border transition-colors ${
        isDark
          ? 'bg-surface-dark border-border-dark text-white'
          : 'bg-surface border-border text-charcoal-900 shadow-subtle'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`p-4 sm:p-5 border-b border-border-subtle ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <h3 className={`text-base font-semibold text-charcoal-900 tracking-tight ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <p className={`text-xs text-charcoal-500 mt-1 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`p-4 sm:p-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div
    className={`p-4 sm:p-5 bg-surface-subtle/40 border-t border-border-subtle flex items-center justify-between gap-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);
