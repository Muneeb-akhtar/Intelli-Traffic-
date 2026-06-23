import { useState, useEffect } from 'react';
import { Video, RefreshCw, Car, Bike, Bus, Truck, Activity } from 'lucide-react';

const BACKEND = 'http://localhost:8081';

interface CountsResponse {
  total:       Record<string, number>;
  on_screen:   Record<string, number>;
  fps:         number;
  source:      string;
  grand_total: number;
}

const VEHICLE_META: { key: string; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { key: 'Car',           label: 'Cars',            icon: <Car  className="w-5 h-5" />, color: '#22c55e', bg: 'rgba(34,197,94,0.10)'  },
  { key: 'Rickshaw/Bike', label: 'Rickshaws & Bikes', icon: <Bike className="w-5 h-5" />, color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  { key: 'Bus/Metro',     label: 'Buses & Metro',   icon: <Bus  className="w-5 h-5" />, color: '#3b82f6', bg: 'rgba(59,130,246,0.10)'  },
  { key: 'Truck',         label: 'Trucks',           icon: <Truck className="w-5 h-5" />, color: '#a855f7', bg: 'rgba(168,85,247,0.10)'  },
];

function VehicleCard({ meta, total, onScreen }: {
  meta: typeof VEHICLE_META[0];
  total: number;
  onScreen: number;
}) {
  return (
    <div className="card-light p-4 flex flex-col gap-3"
      style={{ borderTop: `3px solid ${meta.color}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <span className="text-sm font-semibold text-[var(--color-corporate-text)]">{meta.label}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: meta.bg, color: meta.color }}>
          {onScreen} on screen
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold tabular-nums text-[var(--color-corporate-text)]"
            style={{ color: meta.color }}>{total.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-corporate-text-muted)] mt-0.5">total counted</p>
        </div>
        {/* Mini bar */}
        <div className="w-24 h-2 rounded-full bg-[var(--color-corporate-border)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, (total / 50) * 100)}%`, background: meta.color }} />
        </div>
      </div>
    </div>
  );
}

export function CameraFeed() {
  const [counts,    setCounts]    = useState<CountsResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/counts`);
        if (r.ok) { setCounts(await r.json()); setConnected(true); }
        else setConnected(false);
      } catch { setConnected(false); }
    };
    poll();
    const t = setInterval(poll, 1000);
    return () => clearInterval(t);
  }, []);

  const handleReset = () =>
    fetch(`${BACKEND}/api/reset`, { method: 'POST' }).catch(() => {});

  const grandTotal = counts?.grand_total ?? 0;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="section-label">
            <span className="section-label-num">05</span>
            <span>—</span>
            <span>Camera feeds</span>
          </p>
          <h2 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] mt-1 flex items-center gap-2">
            <Video className="w-5 h-5 text-accent" />
            Live Traffic Detection
          </h2>
          <p className="text-sm text-[var(--color-corporate-text-muted)] mt-0.5">
            YOLOv8 · Cars · Rickshaws · Bikes · Buses · Trucks — Lahore road traffic
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {counts && (
            <span className="text-xs tabular-nums text-[var(--color-corporate-text-muted)] bg-[var(--color-corporate-muted)] px-2.5 py-1 rounded-full border border-[var(--color-corporate-border)]">
              {counts.fps} FPS
            </span>
          )}
          <div className={`badge shrink-0 ${connected ? 'badge-green' : 'badge-red'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {connected ? 'AI live' : 'AI offline'}
          </div>
          {connected && (
            <button onClick={handleReset}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[var(--color-corporate-border)] text-[var(--color-corporate-text-muted)] hover:border-accent hover:text-accent transition-colors cursor-pointer">
              <RefreshCw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Offline ── */}
      {!connected && (
        <div className="card-light p-5 border-l-4 border-l-red-400">
          <p className="text-sm font-semibold text-red-600 mb-1">AI detection server not running</p>
          <p className="text-xs text-[var(--color-corporate-text-muted)] mb-3">
            Start the vehicle counter from your project root:
          </p>
          <code className="block text-xs bg-[var(--color-corporate-muted)] border border-[var(--color-corporate-border)] rounded-lg px-4 py-2.5 font-mono text-[var(--color-corporate-text)]">
            .venv\Scripts\python.exe ai_module\vehicle_counter.py
          </code>
        </div>
      )}

      {/* ── Grand total strip ── */}
      {connected && (
        <div className="card-light px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-accent shrink-0" />
            <div>
              <p className="text-xs text-[var(--color-corporate-text-muted)] font-medium uppercase tracking-wide">Total vehicles counted</p>
              <p className="font-heading text-3xl font-bold text-[var(--color-corporate-text)] tabular-nums">
                {grandTotal.toLocaleString()}
              </p>
            </div>
          </div>
          {counts?.source && counts.source !== 'none' && (
            <p className="text-xs text-[var(--color-corporate-text-muted)] font-mono truncate max-w-[220px] hidden sm:block">
              {counts.source.split('/').pop()}
            </p>
          )}
        </div>
      )}

      {/* ── MJPEG Stream ── */}
      {connected && (
        <div className="card-light overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-corporate-border)]">
            <span className="text-xs font-semibold text-[var(--color-corporate-text-muted)] uppercase tracking-wide">
              Live camera — Lahore traffic
            </span>
            <button onClick={() => setStreamKey(k => k + 1)}
              className="flex items-center gap-1 text-[10px] text-accent hover:underline cursor-pointer">
              <RefreshCw className="w-3 h-3" /> Reload stream
            </button>
          </div>
          <div className="bg-black relative">
            <img
              key={streamKey}
              src={`${BACKEND}/video`}
              alt="Live Lahore traffic detection"
              className="w-full block"
              style={{ maxHeight: 520, objectFit: 'contain' }}
            />
            {/* Live badge overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/75 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE · YOLOv8
            </div>
            {/* On-screen count overlay */}
            {counts && (
              <div className="absolute bottom-3 left-3 bg-black/75 text-white text-xs px-3 py-1.5 rounded-lg font-mono">
                On screen: {Object.values(counts.on_screen).reduce((a, b) => a + b, 0)} vehicles
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Per-type count cards ── */}
      {connected && counts && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {VEHICLE_META.map(meta => (
            <VehicleCard
              key={meta.key}
              meta={meta}
              total={counts.total[meta.key] ?? 0}
              onScreen={counts.on_screen[meta.key] ?? 0}
            />
          ))}
        </div>
      )}

    </div>
  );
}
