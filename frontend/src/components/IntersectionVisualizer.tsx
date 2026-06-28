import React from 'react';
import { MapPin, Siren } from 'lucide-react';
import type { IntersectionState, LaneData } from '../types';

interface Props {
  state: IntersectionState;
  laneData: LaneData;
}

function getTotal(data: { car: number; motorcycle: number; truck: number; bus: number }) {
  return data.car + data.motorcycle + data.truck + data.bus;
}

// Off-state is a neutral light gray so it reads cleanly on white backgrounds
const SIG = {
  red:    { on: '#ef4444', off: '#e2e8f0' },
  yellow: { on: '#eab308', off: '#e2e8f0' },
  green:  { on: '#22c55e', off: '#e2e8f0' },
} as const;

function SignalLight({ color, active }: { color: 'red' | 'yellow' | 'green'; active: boolean }) {
  const c = SIG[color];
  return (
    <div
      className="rounded-full transition-all duration-300"
      style={{
        width: 12,
        height: 12,
        backgroundColor: active ? c.on : c.off,
        boxShadow: active ? `0 0 8px ${c.on}` : 'none',
      }}
    />
  );
}

function TrafficSignal({ lightState }: { lightState: 'GREEN' | 'YELLOW' | 'RED' }) {
  return (
    <div className="flex gap-1.5 items-center bg-white px-2 py-1.5 rounded-lg border border-[var(--color-corporate-border)] shadow-sm">
      <SignalLight color="red"    active={lightState === 'RED'}    />
      <SignalLight color="yellow" active={lightState === 'YELLOW'} />
      <SignalLight color="green"  active={lightState === 'GREEN'}  />
    </div>
  );
}

export const IntersectionVisualizer: React.FC<Props> = ({ state, laneData }) => {
  const getLaneLight = (index: number): 'GREEN' | 'YELLOW' | 'RED' => {
    return state.currentLaneIndex === index ? state.lightState : 'RED';
  };

  const sigColor =
    state.lightState === 'GREEN'  ? '#16a34a' :
    state.lightState === 'YELLOW' ? '#b45309' : '#dc2626';

  return (
    <div className="card-light p-4 sm:p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            01 · Intersection
          </p>
          <h2 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)] mt-1">
            Live intersection overview
          </h2>
          <p className="text-xs text-[var(--color-corporate-text-muted)] mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0 text-accent" />
            Junction A — 4-way signal control
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {state.emergencyActive ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Emergency
            </span>
          ) : state.isOverrideActive ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Manual
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Automatic
            </span>
          )}
        </div>
      </div>

      {/* Emergency Warning Banner */}
      {state.emergencyActive && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2.5 animate-pulse">
          <Siren className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs font-medium text-red-700">
            Emergency vehicle priority active — all conflicting lanes held RED
          </p>
        </div>
      )}

      <div className="flex-1 relative flex items-center justify-center min-h-[240px] sm:min-h-[300px] lg:min-h-[340px] w-full">
        <svg
          className="absolute w-[min(280px,80vw)] h-auto"
          viewBox="0 0 280 280"
          aria-hidden
        >
          {/* Road surfaces — light gray */}
          <rect x="112" y="0"   width="56" height="280" fill="#e2e8f0" rx="2" />
          <rect x="0"   y="112" width="280" height="56" fill="#e2e8f0" rx="2" />
          {/* Centre dashes */}
          <line x1="140" y1="0"   x2="140" y2="106" stroke="#94a3b8" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="140" y1="174" x2="140" y2="280" stroke="#94a3b8" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="0"   y1="140" x2="106" y2="140" stroke="#94a3b8" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="174" y1="140" x2="280" y2="140" stroke="#94a3b8" strokeWidth="1" strokeDasharray="8,6" />
          {/* Kerb lines */}
          <line x1="112" y1="0"   x2="112" y2="112" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="168" y1="0"   x2="168" y2="112" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="112" y1="168" x2="112" y2="280" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="168" y1="168" x2="168" y2="280" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="0"   y1="112" x2="112" y2="112" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="168" y1="112" x2="280" y2="112" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="0"   y1="168" x2="112" y2="168" stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1="168" y1="168" x2="280" y2="168" stroke="#cbd5e1" strokeWidth="1.5" />
          {/* Box junction centre */}
          <rect x="112" y="112" width="56" height="56" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
        </svg>

        {/* Phase countdown */}
        <div className="absolute z-20 flex flex-col items-center">
          <span
            className="font-heading text-3xl sm:text-4xl font-bold tabular-nums"
            style={{ color: sigColor }}
          >
            {state.timeRemaining}
          </span>
          <span className="text-xs text-[var(--color-corporate-text-muted)] font-medium mt-0.5">seconds</span>
        </div>

        {/* Lane positions */}
        <div className="absolute bottom-0 flex flex-col items-center gap-2 z-10">
          <TrafficSignal lightState={getLaneLight(0)} />
          <LaneCard name="North" count={getTotal(laneData['Northbound'])} light={getLaneLight(0)} isEmergency={state.emergencyActive && state.emergencyLaneIndex === 0} />
        </div>
        <div className="absolute top-0 flex flex-col items-center gap-2 z-10">
          <LaneCard name="South" count={getTotal(laneData['Southbound'])} light={getLaneLight(1)} isEmergency={state.emergencyActive && state.emergencyLaneIndex === 1} />
          <TrafficSignal lightState={getLaneLight(1)} />
        </div>
        <div className="absolute right-0 flex items-center gap-2 z-10">
          <TrafficSignal lightState={getLaneLight(2)} />
          <LaneCard name="East"  count={getTotal(laneData['Eastbound'])}  light={getLaneLight(2)} isEmergency={state.emergencyActive && state.emergencyLaneIndex === 2} />
        </div>
        <div className="absolute left-0 flex items-center gap-2 z-10">
          <LaneCard name="West"  count={getTotal(laneData['Westbound'])}  light={getLaneLight(3)} isEmergency={state.emergencyActive && state.emergencyLaneIndex === 3} />
          <TrafficSignal lightState={getLaneLight(3)} />
        </div>
      </div>

      {/* Lane summary strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(laneData).map(([lane, counts]) => (
          <div key={lane}
            className="bg-[var(--color-corporate-muted)] border border-[var(--color-corporate-border)] rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-[var(--color-corporate-text-muted)] font-medium truncate">
              {lane.replace('bound', '')}
            </p>
            <p className="text-sm font-semibold text-[var(--color-corporate-text)] mt-0.5 tabular-nums">
              {getTotal(counts)}
            </p>
            <p className="text-xs text-[var(--color-corporate-text-muted)] tabular-nums">
              {counts.car}c · {counts.motorcycle}m · {counts.truck}t · {counts.bus}b
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

function LaneCard({ name, count, light, isEmergency }: { name: string; count: number; light: string; isEmergency?: boolean }) {
  return (
    <div
      className={`bg-white border rounded-lg px-3 py-2 text-center min-w-[68px] sm:min-w-[72px] transition-all duration-300 shadow-sm ${
        isEmergency
          ? 'border-red-300 shadow-red-100'
          : light === 'GREEN'
            ? 'border-green-300'
            : 'border-[var(--color-corporate-border)]'
      }`}
    >
      <p className={`text-xs font-medium ${isEmergency ? 'text-red-600' : 'text-[var(--color-corporate-text-muted)]'}`}>
        {isEmergency && '🚨 '}{name}
      </p>
      <p className="text-lg font-bold text-[var(--color-corporate-text)] leading-tight tabular-nums">{count}</p>
    </div>
  );
}
