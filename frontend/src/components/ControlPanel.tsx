import React, { useState } from 'react';
import { AlertTriangle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Hand, Siren, Settings } from 'lucide-react';
import type { IntersectionState, EngineSettings } from '../types';

interface Props {
  state: IntersectionState;
  settings: EngineSettings;
  onOverrideStart: (laneIndex: number) => Promise<void>;
  onOverrideStop: () => Promise<void>;
  onEmergencyStart: (laneIndex: number) => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  onUpdateSettings: (settings: Partial<EngineSettings>) => Promise<void>;
}

const LANES = [
  { name: 'Northbound', short: 'North', icon: ArrowUp },
  { name: 'Southbound', short: 'South', icon: ArrowDown },
  { name: 'Eastbound', short: 'East', icon: ArrowRight },
  { name: 'Westbound', short: 'West', icon: ArrowLeft },
] as const;

const laneButtonBase =
  'text-left px-4 py-3.5 rounded-lg border text-sm font-medium transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:opacity-50 disabled:cursor-not-allowed';

export const ControlPanel: React.FC<Props> = ({
  state,
  settings,
  onOverrideStart,
  onOverrideStop,
  onEmergencyStart,
  onEmergencyStop,
  onUpdateSettings,
}) => {
  const [loading, setLoading] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);
  const [settingsDirty, setSettingsDirty] = useState(false);

  // Sync incoming settings when they change from server
  React.useEffect(() => {
    if (!settingsDirty) {
      setLocalSettings(settings);
    }
  }, [settings, settingsDirty]);

  const handleOverride = async (index: number) => {
    setLoading(true);
    try {
      if (state.isOverrideActive && state.currentLaneIndex === index) {
        await onOverrideStop();
      } else {
        await onOverrideStart(index);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmergency = async (index: number) => {
    setLoading(true);
    try {
      if (state.emergencyActive && state.emergencyLaneIndex === index) {
        await onEmergencyStop();
      } else {
        await onEmergencyStart(index);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (key: keyof EngineSettings, value: string) => {
    const num = parseInt(value);
    if (isNaN(num)) return;
    setLocalSettings(prev => ({ ...prev, [key]: num }));
    setSettingsDirty(true);
  };

  const handleApplySettings = async () => {
    setLoading(true);
    try {
      await onUpdateSettings(localSettings);
      setSettingsDirty(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            01 · Control
          </p>
          <h2 className="font-heading text-sm font-semibold text-text-primary mt-1">Signal control</h2>
          <p className="text-xs text-text-tertiary mt-0.5">Manual override and system parameters</p>
        </div>
        {state.isOverrideActive && (
          <span className="badge badge-yellow shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            Override active
          </span>
        )}
        {state.emergencyActive && (
          <span className="badge badge-red shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Emergency
          </span>
        )}
      </div>

      {/* Admin Override Info */}
      <div className="card-inner p-3 mb-4 flex gap-3 border-l-2 border-l-accent/40">
        <AlertTriangle className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-medium text-text-primary">Admin override</p>
          <p className="text-xs text-text-tertiary leading-relaxed mt-0.5">
            Forcing a lane green holds it for 30 seconds max. Releasing triggers a 3s yellow safety buffer before resuming automatic control.
          </p>
        </div>
      </div>

      {/* Lane Override Buttons */}
      <div className="flex-1">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
          Select lane to force green
        </p>
        <div className="grid grid-cols-2 gap-2">
          {LANES.map((lane, index) => {
            const isActive = state.isOverrideActive && state.currentLaneIndex === index;
            const Icon = lane.icon;
            return (
              <button
                key={lane.name}
                type="button"
                disabled={loading || state.emergencyActive}
                onClick={() => handleOverride(index)}
                className={`${laneButtonBase} ${
                  isActive
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                    : 'bg-surface-3 border-border text-text-secondary hover:bg-surface-4 hover:text-text-primary hover:border-accent/40'
                } ${!isActive ? 'hover:shadow-[0_0_0_1px_rgba(243,110,32,0.2)]' : ''}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
                    {lane.short}
                  </span>
                  {isActive && <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}
                </span>
                <span className="text-xs text-text-tertiary mt-1 block">
                  {isActive ? 'Click to release' : 'Force green'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={loading || !state.isOverrideActive}
        onClick={() => {
          if (!state.isOverrideActive) return;
          setLoading(true);
          onOverrideStop().finally(() => setLoading(false));
        }}
        className={`mt-4 w-full py-2.5 rounded-full text-sm font-semibold border transition-all ${
          state.isOverrideActive
            ? 'bg-accent text-white border-accent hover:bg-[var(--color-accent-hover)] shadow-md'
            : 'bg-surface-3 border-border text-text-tertiary opacity-60 cursor-not-allowed'
        }`}
      >
        <span className="inline-flex items-center justify-center gap-2 w-full">
          <Hand className="w-4 h-4" aria-hidden />
          Release override
        </span>
      </button>

      {/* Emergency Vehicle Priority */}
      <div className="mt-5 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Siren className="w-4 h-4 text-red-400" />
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Emergency vehicle priority
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LANES.map((lane, index) => {
            const isEmergency = state.emergencyActive && state.emergencyLaneIndex === index;
            const Icon = lane.icon;
            return (
              <button
                key={`emg-${lane.name}`}
                type="button"
                disabled={loading || state.isOverrideActive}
                onClick={() => handleEmergency(index)}
                className={`${laneButtonBase} ${
                  isEmergency
                    ? 'bg-red-500/15 border-red-500/40 text-red-300'
                    : 'bg-surface-3 border-border text-text-secondary hover:bg-red-500/5 hover:text-red-300 hover:border-red-500/30'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
                    {lane.short}
                  </span>
                  {isEmergency && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                </span>
                <span className="text-xs text-text-tertiary mt-1 block">
                  {isEmergency ? 'Click to clear' : '🚨 Emergency'}
                </span>
              </button>
            );
          })}
        </div>
        {state.emergencyActive && (
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              onEmergencyStop().finally(() => setLoading(false));
            }}
            className="mt-3 w-full py-2.5 rounded-full text-sm font-semibold border bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25 transition-all"
          >
            <span className="inline-flex items-center justify-center gap-2 w-full">
              <Siren className="w-4 h-4" aria-hidden />
              Clear emergency
            </span>
          </button>
        )}
      </div>

      {/* Engine Parameters — Editable */}
      <div className="mt-5 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-text-tertiary" />
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Engine parameters
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
          <ParamRow label="Cycle" value={String(state.cycleCount)} />
          <ParamRow label="Safety buffer" value="3.0s" />
          <ParamInput
            label="Min green"
            value={localSettings.minGreen}
            unit="s"
            onChange={(v) => handleSettingChange('minGreen', v)}
          />
          <ParamInput
            label="Max green"
            value={localSettings.maxGreen}
            unit="s"
            onChange={(v) => handleSettingChange('maxGreen', v)}
          />
          <ParamInput
            label="Density cap"
            value={localSettings.densityCap}
            unit=""
            onChange={(v) => handleSettingChange('densityCap', v)}
          />
        </div>
        {settingsDirty && (
          <button
            type="button"
            disabled={loading}
            onClick={handleApplySettings}
            className="mt-3 w-full py-2 rounded-lg text-xs font-semibold bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-all"
          >
            Apply settings
          </button>
        )}
      </div>
    </div>
  );
};

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-tertiary">{label}</span>
      <span className="text-text-secondary font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ParamInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-text-tertiary">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-14 bg-surface-3 border border-border rounded px-1.5 py-0.5 text-xs text-text-secondary font-medium tabular-nums text-right outline-none focus:border-accent/50 transition-colors"
        />
        {unit && <span className="text-text-tertiary">{unit}</span>}
      </span>
    </div>
  );
}
