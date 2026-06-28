import React from 'react';
import type { AnalyticsRecord } from '../types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';

interface Props {
  data: AnalyticsRecord[];
}

const GRID = 'var(--color-corporate-border)';
const TICK = 'var(--color-corporate-text-muted)';

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string; fill?: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[var(--color-corporate-border)] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-[var(--color-corporate-text-muted)] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs font-semibold" style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export const AnalyticsCharts: React.FC<Props> = ({ data }) => {
  const chartData = data.slice(-14);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
      <div className="card-light p-4 sm:p-5 bg-[var(--color-brand-sky)]/30">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">Traffic volume</h3>
            <p className="text-xs text-[var(--color-corporate-text-muted)] mt-0.5">Hourly vehicle count and congestion load</p>
          </div>
          <span className="badge badge-orange shrink-0">Live</span>
        </div>
        <div className="h-[160px] sm:h-[200px] lg:h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gVehicles" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCongestion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-sig-red)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--color-sig-red)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" stroke={TICK} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={TICK} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="totalVehicles"
                name="Vehicles"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                fill="url(#gVehicles)"
              />
              <Area
                type="monotone"
                dataKey="congestionIndex"
                name="Congestion"
                stroke="var(--color-sig-red)"
                strokeWidth={1}
                fill="url(#gCongestion)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-light p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">Average wait time</h3>
            <p className="text-xs text-[var(--color-corporate-text-muted)] mt-0.5">Adaptive cycle delay per hour (seconds)</p>
          </div>
          <span className="badge badge-neutral shrink-0">vs 60s static</span>
        </div>
        <div className="h-[160px] sm:h-[200px] lg:h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" stroke={TICK} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={TICK} fontSize={12} tickLine={false} axisLine={false} unit="s" />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="averageWaitSeconds"
                name="Wait Time"
                fill="var(--color-sig-green)"
                radius={[3, 3, 0, 0]}
                maxBarSize={24}
                opacity={0.75}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
