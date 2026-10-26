import React, { useState } from 'react';
import { ConfusionMatrixData } from '@/types/evaluation';
import { Button } from '@/components/ui/Button';

interface ConfusionMatrixProps {
  data: ConfusionMatrixData;
  className?: string;
}

export const ConfusionMatrix: React.FC<ConfusionMatrixProps> = ({ data, className = '' }) => {
  const [showNormalized, setShowNormalized] = useState(true);

  if (!data || !data.classes || data.classes.length === 0) {
    return <div className="text-xs text-charcoal-400 p-4">No confusion matrix data available.</div>;
  }

  const { classes, matrix, totalSamples } = data;

  // Calculate row totals for normalization
  const rowTotals = matrix.map(row => row.reduce((a, b) => a + b, 0));

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-charcoal-500 font-mono">
          N = {totalSamples.toLocaleString()} evaluated flows
        </div>
        <div className="flex items-center gap-1 bg-surface-subtle p-0.5 rounded border border-border">
          <Button
            size="sm"
            variant={showNormalized ? 'primary' : 'ghost'}
            className="h-6 text-[11px] px-2"
            onClick={() => setShowNormalized(true)}
          >
            Normalized (%)
          </Button>
          <Button
            size="sm"
            variant={!showNormalized ? 'primary' : 'ghost'}
            className="h-6 text-[11px] px-2"
            onClick={() => setShowNormalized(false)}
          >
            Raw Counts
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs font-mono">
          <thead>
            <tr>
              <th className="p-2 border border-border bg-surface-subtle text-left font-sans text-charcoal-500">
                True \ Pred
              </th>
              {classes.map(c => (
                <th
                  key={c}
                  className="p-2 border border-border bg-surface-subtle text-center font-medium text-charcoal-700 min-w-[70px]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((actualClass, rowIdx) => {
              const rowTotal = rowTotals[rowIdx] || 1;
              return (
                <tr key={actualClass}>
                  <td className="p-2 border border-border bg-surface-subtle font-sans font-medium text-charcoal-800 text-left whitespace-nowrap">
                    {actualClass}
                  </td>
                  {classes.map((_, colIdx) => {
                    const count = matrix[rowIdx]?.[colIdx] ?? 0;
                    const isDiagonal = rowIdx === colIdx;
                    const percentage = (count / rowTotal) * 100;

                    let bgStyle = 'bg-surface text-charcoal-700';
                    if (isDiagonal) {
                      if (percentage >= 95) bgStyle = 'bg-forest-700 text-white font-bold';
                      else if (percentage >= 85) bgStyle = 'bg-forest-500 text-white font-semibold';
                      else bgStyle = 'bg-forest-100 text-forest-900';
                    } else if (count > 0) {
                      if (percentage > 5) bgStyle = 'bg-mutedRed-100 text-mutedRed-800 font-semibold';
                      else bgStyle = 'bg-surface-subtle text-charcoal-600';
                    }

                    return (
                      <td
                        key={colIdx}
                        className={`p-2 border border-border text-center transition-colors ${bgStyle}`}
                        title={`True: ${actualClass}, Predicted: ${classes[colIdx]}, Count: ${count} (${percentage.toFixed(1)}%)`}
                      >
                        {showNormalized ? `${percentage.toFixed(1)}%` : count.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-charcoal-500 pt-1 border-t border-border-subtle">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-forest-700" /> Correct Predictions (High Recall)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-mutedRed-100 border border-mutedRed-300" /> Misclassified Inter-Class Leakage
        </span>
      </div>
    </div>
  );
};
