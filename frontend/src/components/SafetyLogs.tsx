import React from 'react';
import { Shield, AlertTriangle, Radio, Settings, Siren, Eye, Zap, Camera, TrendingUp, AlertCircle, Car } from 'lucide-react';
import type { SafetyLogEntry } from '../types';

interface Props {
  logs: SafetyLogEntry[];
}

function getLogMeta(type: string): { icon: React.ReactNode; badge: string; label: string } {
  switch (type) {
    case 'OVERRIDE_START':
      return { icon: <Radio className="w-3.5 h-3.5" />, badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Override Start' };
    case 'OVERRIDE_STOP':
      return { icon: <Radio className="w-3.5 h-3.5" />, badge: 'bg-green-100 text-green-700 border-green-200', label: 'Override Stop' };
    case 'EMERGENCY_START':
      return { icon: <Siren className="w-3.5 h-3.5" />, badge: 'bg-red-100 text-red-700 border-red-200', label: 'Emergency' };
    case 'EMERGENCY_STOP':
      return { icon: <Siren className="w-3.5 h-3.5" />, badge: 'bg-green-100 text-green-700 border-green-200', label: 'Emergency Clear' };
    case 'SETTINGS_CHANGE':
      return { icon: <Settings className="w-3.5 h-3.5" />, badge: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Settings' };
    case 'PEDESTRIAN_ALERT':
      return { icon: <Eye className="w-3.5 h-3.5" />, badge: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Pedestrian' };
    case 'SPEED_VIOLATION':
      return { icon: <Zap className="w-3.5 h-3.5" />, badge: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Speed Alert' };
    case 'QUEUE_SPILLBACK':
      return { icon: <TrendingUp className="w-3.5 h-3.5" />, badge: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Queue Alert' };
    case 'NEAR_MISS':
      return { icon: <AlertCircle className="w-3.5 h-3.5" />, badge: 'bg-red-100 text-red-700 border-red-200', label: 'Near Miss' };
    case 'CONGESTION_ALERT':
      return { icon: <Car className="w-3.5 h-3.5" />, badge: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Congestion' };
    case 'CAMERA_WARNING':
      return { icon: <Camera className="w-3.5 h-3.5" />, badge: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Camera' };
    case 'SIGNAL_FAULT':
      return { icon: <AlertTriangle className="w-3.5 h-3.5" />, badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Signal Fault' };
    case 'WRONG_WAY':
      return { icon: <AlertTriangle className="w-3.5 h-3.5" />, badge: 'bg-red-100 text-red-800 border-red-300', label: 'Wrong Way' };
    case 'COUNT_SPIKE':
      return { icon: <TrendingUp className="w-3.5 h-3.5" />, badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Count Spike' };
    default:
      return { icon: <Shield className="w-3.5 h-3.5" />, badge: 'bg-[var(--color-corporate-muted)] text-[var(--color-corporate-text-muted)] border-[var(--color-corporate-border)]', label: type.replace(/_/g, ' ') };
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

const SEVERITY: Record<string, 'high' | 'medium' | 'low'> = {
  EMERGENCY_START: 'high', NEAR_MISS: 'high', WRONG_WAY: 'high',
  SPEED_VIOLATION: 'medium', QUEUE_SPILLBACK: 'medium', CONGESTION_ALERT: 'medium',
  OVERRIDE_START: 'medium', SIGNAL_FAULT: 'medium',
  PEDESTRIAN_ALERT: 'low', CAMERA_WARNING: 'low', SETTINGS_CHANGE: 'low',
  COUNT_SPIKE: 'low', OVERRIDE_STOP: 'low', EMERGENCY_STOP: 'low',
};

const severityDot: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    'bg-green-400',
};

export const SafetyLogs: React.FC<Props> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="card-light p-8 sm:p-12 text-center">
        <Shield className="w-10 h-10 text-[var(--color-corporate-border)] mx-auto mb-3" />
        <p className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">No safety events yet</p>
        <p className="text-xs text-[var(--color-corporate-text-muted)] mt-1 max-w-sm mx-auto">
          Safety events will appear here when overrides, emergencies, or alerts occur.
        </p>
      </div>
    );
  }

  const highCount   = logs.filter(l => SEVERITY[l.type] === 'high').length;
  const mediumCount = logs.filter(l => SEVERITY[l.type] === 'medium').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Severity summary bar */}
      <div className="card-light px-4 py-3 flex flex-wrap items-center gap-4 sm:gap-6">
        <span className="text-xs font-semibold text-[var(--color-corporate-text-muted)] uppercase tracking-wider">Severity</span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          High · {highCount}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Medium · {mediumCount}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Low · {logs.length - highCount - mediumCount}
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-corporate-text-muted)] tabular-nums">
          {logs.length} total events
        </span>
      </div>

      {/* Log table */}
      <div className="card-light overflow-hidden">
        <div className="grid grid-cols-[8px_72px_110px_1fr] sm:grid-cols-[8px_88px_130px_1fr] gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 bg-[var(--color-corporate-muted)] border-b border-[var(--color-corporate-border)]">
          <span />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Time</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Type</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Details</span>
        </div>

        <div className="max-h-[480px] overflow-y-auto divide-y divide-[var(--color-corporate-border)]">
          {logs.map((log, i) => {
            const { icon, badge, label } = getLogMeta(log.type);
            const sev = SEVERITY[log.type] ?? 'low';
            return (
              <div
                key={`${log.timestamp}-${i}`}
                className="grid grid-cols-[8px_72px_110px_1fr] sm:grid-cols-[8px_88px_130px_1fr] gap-2 sm:gap-3 px-4 sm:px-5 py-3 items-start hover:bg-[var(--color-corporate-muted)]/50 transition-colors"
              >
                {/* Severity dot */}
                <span className="mt-1.5 flex items-start justify-center">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${severityDot[sev]}`} />
                </span>

                {/* Time */}
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[var(--color-corporate-text)] tabular-nums">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className="text-[10px] text-[var(--color-corporate-text-muted)]">
                    {formatDate(log.timestamp)}
                  </span>
                </div>

                {/* Badge */}
                <div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge}`}>
                    {icon}
                    {label}
                  </span>
                </div>

                {/* Message */}
                <p className="text-xs text-[var(--color-corporate-text-muted)] leading-relaxed">
                  {log.message}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
