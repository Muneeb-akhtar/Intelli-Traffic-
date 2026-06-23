import React from 'react';
import { Shield, AlertTriangle, Radio, Settings, Siren } from 'lucide-react';
import type { SafetyLogEntry } from '../types';

interface Props {
  logs: SafetyLogEntry[];
}

function getLogIcon(type: string) {
  switch (type) {
    case 'OVERRIDE_START':
    case 'OVERRIDE_STOP':
      return <Radio className="w-3.5 h-3.5 text-yellow-500" />;
    case 'EMERGENCY_START':
    case 'EMERGENCY_STOP':
      return <Siren className="w-3.5 h-3.5 text-red-400" />;
    case 'SETTINGS_CHANGE':
      return <Settings className="w-3.5 h-3.5 text-blue-400" />;
    default:
      return <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-corporate-text-muted)]" />;
  }
}

function getLogBadge(type: string) {
  switch (type) {
    case 'OVERRIDE_START':
      return 'badge-yellow';
    case 'OVERRIDE_STOP':
      return 'badge-green';
    case 'EMERGENCY_START':
      return 'badge-red';
    case 'EMERGENCY_STOP':
      return 'badge-green';
    case 'SETTINGS_CHANGE':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const SafetyLogs: React.FC<Props> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="card-light p-8 sm:p-12 text-center">
        <Shield className="w-10 h-10 text-[var(--color-corporate-border)] mx-auto mb-3" />
        <p className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">No safety events yet</p>
        <p className="text-xs text-[var(--color-corporate-text-muted)] mt-1 max-w-sm mx-auto">
          Safety events will appear here when overrides, emergencies, or settings changes occur.
        </p>
      </div>
    );
  }

  return (
    <div className="card-light overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[80px_100px_1fr] sm:grid-cols-[90px_120px_1fr] gap-3 px-4 sm:px-5 py-3 bg-[var(--color-corporate-muted)] border-b border-[var(--color-corporate-border)]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Time</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Type</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Details</span>
      </div>

      {/* Log entries */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--color-corporate-border)]">
        {logs.map((log, i) => (
          <div
            key={`${log.timestamp}-${i}`}
            className="grid grid-cols-[80px_100px_1fr] sm:grid-cols-[90px_120px_1fr] gap-3 px-4 sm:px-5 py-3 items-start hover:bg-[var(--color-corporate-muted)]/50 transition-colors"
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-[var(--color-corporate-text)] tabular-nums">
                {formatTimestamp(log.timestamp)}
              </span>
              <span className="text-[10px] text-[var(--color-corporate-text-muted)]">
                {formatDate(log.timestamp)}
              </span>
            </div>
            <div>
              <span className={`badge ${getLogBadge(log.type)} text-[10px] py-0.5 px-2`}>
                {getLogIcon(log.type)}
                {log.type.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-[var(--color-corporate-text-muted)] leading-relaxed">
              {log.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
