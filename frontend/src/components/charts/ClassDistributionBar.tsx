import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ClassDistribution } from '@/types/dataset';

interface ClassDistributionBarProps {
  distribution: ClassDistribution[];
  className?: string;
  horizontal?: boolean;
}

export const ClassDistributionBar: React.FC<ClassDistributionBarProps> = ({
  distribution,
  className = '',
  horizontal = true,
}) => {
  if (!distribution || distribution.length === 0) {
    return <div className="text-xs text-charcoal-400 p-4 font-mono">No class distribution data.</div>;
  }

  const chartData = distribution.map(d => ({
    name: d.className,
    count: d.count,
    percentage: d.percentage,
    isMalicious: d.isMalicious,
  }));

  if (horizontal) {
    return (
      <div className={`w-full h-56 ${className}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <XAxis type="number" fontSize={11} stroke="#616C77" tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              fontSize={11}
              stroke="#616C77"
              tickLine={false}
              width={90}
            />
            <Tooltip
              formatter={(val: any, _name: any, item: any) => [
                `${Number(val).toLocaleString()} flows (${item.payload.percentage}%)`,
                'Traffic Volume',
              ]}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                borderColor: '#E2E5DF',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
            <Bar dataKey="count" radius={[0, 3, 3, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isMalicious ? '#C44E4E' : '#284E3A'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={`w-full h-56 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
          <XAxis
            dataKey="name"
            fontSize={10}
            stroke="#616C77"
            tickLine={false}
            angle={-25}
            textAnchor="end"
          />
          <YAxis fontSize={11} stroke="#616C77" tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              borderColor: '#E2E5DF',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isMalicious ? '#C44E4E' : '#284E3A'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
