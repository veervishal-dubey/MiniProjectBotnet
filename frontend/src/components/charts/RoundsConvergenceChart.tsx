import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { FLRoundSummary } from '@/types/federated';

interface RoundsConvergenceChartProps {
  roundsHistory: FLRoundSummary[];
  className?: string;
}

export const RoundsConvergenceChart: React.FC<RoundsConvergenceChartProps> = ({
  roundsHistory,
  className = '',
}) => {
  if (!roundsHistory || roundsHistory.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-charcoal-400 font-mono">
        No communication rounds recorded yet.
      </div>
    );
  }

  const chartData = roundsHistory.map(r => ({
    round: `R${r.round}`,
    Accuracy: +(r.globalAccuracy * 100).toFixed(2),
    F1Score: +(r.globalF1 * 100).toFixed(2),
    Loss: +r.globalLoss.toFixed(3),
  }));

  return (
    <div className={`w-full h-72 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E5DF" vertical={false} />
          <XAxis
            dataKey="round"
            stroke="#616C77"
            fontSize={11}
            tickLine={false}
            fontFamily="JetBrains Mono, monospace"
          />
          <YAxis
            yAxisId="left"
            domain={[60, 100]}
            stroke="#1C3B2C"
            fontSize={11}
            tickLine={false}
            unit="%"
            fontFamily="JetBrains Mono, monospace"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 1.0]}
            stroke="#C98A28"
            fontSize={11}
            tickLine={false}
            fontFamily="JetBrains Mono, monospace"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              borderColor: '#E2E5DF',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
            }}
          />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Accuracy"
            name="Global Accuracy (%)"
            stroke="#1C3B2C"
            strokeWidth={2}
            dot={{ r: 3, fill: '#1C3B2C' }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="F1Score"
            name="Global F1-Score (%)"
            stroke="#4F8064"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 2, fill: '#4F8064' }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="Loss"
            name="Global Cross-Entropy Loss"
            stroke="#C98A28"
            strokeWidth={1.75}
            dot={{ r: 3, fill: '#C98A28' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
