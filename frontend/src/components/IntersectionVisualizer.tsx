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

const SIG = {
  red: { on: 'var(--color-sig-red)', off: 'var(--color-surface-3)' },
  yellow: { on: 'var(--color-sig-yellow)', off: 'var(--color-surface-3)' },
  green: { on: 'var(--color-sig-green)', off: 'var(--color-surface-3)' },
} as const;

function SignalLight({ color, active }: { color: 'red' | 'yellow' | 'green'; active: boolean }) {
  const c = SIG[color];
  const bg = active ? c.on : c.off;
  return (
    <div
      className="rounded-full transition-all duration-300"
      style={{
        width: 12,
        height: 12,
        backgroundColor: bg,
        boxShadow: active ? `0 0 10px ${bg}` : 'none',
      }}
    />
  );
}

function TrafficSignal({ lightState }: { lightState: 'GREEN' | 'YELLOW' | 'RED' }) {
  return (
    <div className="flex gap-1.5 items-center bg-surface-0 px-2 py-1.5 rounded-lg border border-border">
      <SignalLight color="red" active={lightState === 'RED'} />
      <SignalLight color="yellow" active={lightState === 'YELLOW'} />
      <SignalLight color="green" active={lightState === 'GREEN'} />
    </div>
  );
}

export const IntersectionVisualizer: React.FC<Props> = ({ state, laneData }) => {
  const getLaneLight = (index: number): 'GREEN' | 'YELLOW' | 'RED' => {
    return state.currentLaneIndex === index ? state.lightState : 'RED';
  };

  return (
    <div className="card p-4 sm:p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            01 · Intersection
          </p>
          <h2 className="font-heading text-sm font-semibold text-text-primary mt-1">
            Live intersection overview
          </h2>
          <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0 text-accent" />
            Junction A — 4-way signal control
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className={`badge shrink-0 ${state.emergencyActive ? 'badge-red' : state.isOverrideActive ? 'badge-yellow' : 'badge-green'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${state.emergencyActive ? 'bg-red-500 animate-pulse' : state.isOverrideActive ? 'bg-yellow-400' : 'bg-green-400'}`} />
            {state.emergencyActive ? 'Emergency' : state.isOverrideActive ? 'Manual' : 'Automatic'}
          </div>
        </div>
      </div>

      {/* Emergency Warning Banner */}
      {state.emergencyActive && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center gap-2.5 animate-pulse">
          <Siren className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs font-medium text-red-300">
            🚨 Emergency vehicle priority active — all conflicting lanes held RED
          </p>
        </div>
      )}

      <div className="flex-1 relative flex items-center justify-center min-h-[280px] sm:min-h-[340px] w-full overflow-x-auto">
        <svg
          className="absolute max-w-full h-auto"
          width="280"
          height="280"
          viewBox="0 0 280 280"
          aria-hidden
        >
          <rect x="112" y="0" width="56" height="280" fill="var(--color-surface-3)" rx="2" />
          <rect x="0" y="112" width="280" height="56" fill="var(--color-surface-3)" rx="2" />
          <line x1="140" y1="0" x2="140" y2="106" stroke="#3f3f46" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="140" y1="174" x2="140" y2="280" stroke="#3f3f46" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="0" y1="140" x2="106" y2="140" stroke="#3f3f46" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="174" y1="140" x2="280" y2="140" stroke="#3f3f46" strokeWidth="1" strokeDasharray="8,6" />
          <line x1="112" y1="0" x2="112" y2="112" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="168" y1="0" x2="168" y2="112" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="112" y1="168" x2="112" y2="280" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="168" y1="168" x2="168" y2="280" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="0" y1="112" x2="112" y2="112" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="168" y1="112" x2="280" y2="112" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="0" y1="168" x2="112" y2="168" stroke="var(--color-border)" strokeWidth="1.5" />
          <line x1="168" y1="168" x2="280" y2="168" stroke="var(--color-border)" strokeWidth="1.5" />
          <rect x="112" y="112" width="56" height="56" fill="var(--color-surface-1)" stroke="var(--color-border)" strokeWidth="1" />
        </svg>

        <div className="absolute z-20 flex flex-col items-center">
          <span
            className={`font-heading text-3xl sm:text-4xl font-bold tabular-nums ${
              state.lightState === 'GREEN'
                ? 'text-sig-green'
                : state.lightState === 'YELLOW'
                  ? 'text-sig-yellow'
                  : 'text-sig-red'
            }`}
          >
            {state.timeRemaining}
          </span>
          <span className="text-xs text-text-tertiary font-medium mt-0.5">seconds</span>
        </div>

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
          <LaneCard name="East" count={getTotal(laneData['Eastbound'])} light={getLaneLight(2)} isEmergency={state.emergencyActive && state.emergencyLaneIndex === 2} />
        </div>

        <div className="absolute left-0 flex items-center gap-2 z-10">
          <LaneCard name="West" count={getTotal(laneData['Westbound'])} light={getLaneLight(3)} isEmergency={state.emergencyActive && state.emergencyLaneIndex === 3} />
          <TrafficSignal lightState={getLaneLight(3)} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(laneData).map(([lane, counts]) => (
          <div key={lane} className="card-inner px-3 py-2 text-center">
            <p className="text-xs text-text-tertiary font-medium truncate">{lane.replace('bound', '')}</p>
            <p className="text-sm font-semibold text-text-primary mt-0.5 tabular-nums">{getTotal(counts)}</p>
            <p className="text-xs text-text-tertiary tabular-nums">
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
      className={`card-inner px-3 py-2 text-center min-w-[68px] sm:min-w-[72px] transition-all duration-300 ${
        isEmergency ? 'border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]' : light === 'GREEN' ? 'border-green-500/30' : ''
      }`}
    >
      <p className={`text-xs font-medium ${isEmergency ? 'text-red-400' : 'text-text-tertiary'}`}>
        {isEmergency && '🚨 '}{name}
      </p>
      <p className="text-lg font-bold text-text-primary leading-tight tabular-nums">{count}</p>
    </div>
  );
}
