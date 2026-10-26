import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className = '' }) => {
  return (
    <div className={`border-b border-border-subtle flex gap-1 ${className}`} role="tablist">
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
              isActive
                ? 'border-forest-800 text-forest-900 font-semibold'
                : 'border-transparent text-charcoal-500 hover:text-charcoal-800 hover:border-charcoal-300'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[11px] font-mono px-1.5 py-0.2 rounded ${
                  isActive ? 'bg-forest-100 text-forest-800' : 'bg-charcoal-100 text-charcoal-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
