import { useState, useEffect, useRef } from 'react';
import { Video, RefreshCw, Car, Bike, Bus, Truck, Activity, Zap, Clock, ShieldAlert } from 'lucide-react';

const BACKEND = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8081';

interface CountsResponse {
  total:       Record<string, number>;
  on_screen:   Record<string, number>;
  fps:         number;
  source:      string;
  name?:       string;
  grand_total: number;
}

interface SignalState {
  signals:        Record<string, 'RED' | 'YELLOW' | 'GREEN'>;
  active_cam:     number | null;
  phase:          string;
  phase_elapsed:  number;
  phase_duration: number;
  time_remaining: number;
  scores:         Record<string, number>;
  wait_times:     Record<string, number>;
  overrides:      Record<string, string | null>;
  emergency:      boolean;
  cycle_count:    number;
  throughput:     number;
  avg_wait:       number;
  efficiency:     number;
}

const CAMERAS = [
  { id: 1, label: 'Camera 1', desc: 'Lahore Road' },
  { id: 2, label: 'Camera 2', desc: 'Main Boulevard' },
  { id: 3, label: 'Camera 3', desc: 'Single Lane A' },
  { id: 4, label: 'Camera 4', desc: 'Single Lane B' },
];

const VEHICLE_META = [
  { key: 'Car',           label: 'Cars',              icon: <Car   className="w-3.5 h-3.5" />, color: '#22c55e' },
  { key: 'Rickshaw/Bike', label: 'Rickshaws & Bikes', icon: <Bike  className="w-3.5 h-3.5" />, color: '#f97316' },
  { key: 'Bus/Metro',     label: 'Buses & Metro',     icon: <Bus   className="w-3.5 h-3.5" />, color: '#3b82f6' },
  { key: 'Truck',         label: 'Trucks',             icon: <Truck className="w-3.5 h-3.5" />, color: '#a855f7' },
];

// ── Traffic Light SVG (same design as AI Dashboard) ───────────────────────────
function TrafficLight({ signal }: { signal?: 'RED' | 'YELLOW' | 'GREEN' }) {
  const fill = (active: boolean, col: string) => active ? col : col + '28';
  return (
    <svg width={26} height={72} viewBox="0 0 26 72" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width={24} height={70} rx="5"
        fill="#1e293b" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx={13} cy={13}  r={8} fill={fill(signal === 'RED',    '#dc2626')} />
      <circle cx={13} cy={37}  r={8} fill={fill(signal === 'YELLOW', '#b45309')} />
      <circle cx={13} cy={61}  r={8} fill={fill(signal === 'GREEN',  '#16a34a')} />
    </svg>
  );
}

// ── Signal badge colours ──────────────────────────────────────────────────────
const SIG_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  GREEN:  { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  YELLOW: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  RED:    { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
};

// ── CameraCell ────────────────────────────────────────────────────────────────
function CameraCell({
  cam,
  signalState,
  onOverride,
}: {
  cam:         typeof CAMERAS[0];
  signalState: SignalState | null;
  onOverride:  (camId: number, action: string) => void;
}) {
  const [counts,    setCounts]    = useState<CountsResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [imgSrc,    setImgSrc]    = useState<string | null>(null);
  const prevUrl    = useRef<string | null>(null);
  const failStreak = useRef(0);

  // Snapshot polling — sequential (setTimeout after response) to avoid piling up
  // concurrent requests when the backend is slow (YOLO at ~1 FPS blocks the GIL).
  useEffect(() => {
    let active = true;
    const INTERVAL = 100;  // 10 FPS target; sequential pattern prevents flooding
    const TIMEOUT  = 6000; // generous timeout for GIL-blocked Flask responses

    const poll = async () => {
      if (!active) return;
      try {
        const r = await fetch(`${BACKEND}/snapshot/${cam.id}`, { signal: AbortSignal.timeout(TIMEOUT) });
        if (!r.ok) throw new Error();
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        if (active) {
          setImgSrc(url);
          setConnected(true);
          failStreak.current = 0;
          if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
          prevUrl.current = url;
        }
      } catch {
        failStreak.current += 1;
        if (failStreak.current >= 5 && active) setConnected(false);
      }
      // Schedule next poll AFTER this one completes — no concurrent pile-up
      if (active) setTimeout(poll, INTERVAL);
    };

    poll();
    return () => {
      active = false;
      if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = null; }
    };
  }, [cam.id, streamKey]);

  // Vehicle count polling
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/counts/${cam.id}`, { signal: AbortSignal.timeout(3000) });
        if (r.ok) setCounts(await r.json());
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [cam.id]);

  const handleReset = () =>
    fetch(`${BACKEND}/api/reset/${cam.id}`, { method: 'POST' }).catch(() => {});

  const grandTotal = counts?.grand_total ?? 0;
  const onScreen   = counts ? Object.values(counts.on_screen).reduce((a, b) => a + b, 0) : 0;

  const camIdStr  = String(cam.id);
  const signal    = signalState?.signals[camIdStr];
  const timeLeft  = signalState?.time_remaining ?? 0;
  const waitTime  = signalState?.wait_times[camIdStr] ?? 0;
  const override  = signalState?.overrides[camIdStr];
  const isActive  = signalState?.active_cam === cam.id;
  const sigStyle  = signal ? SIG_STYLE[signal] : SIG_STYLE.RED;

  return (
    <div className="card-light overflow-hidden flex flex-col">

      {/* ── Camera header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-corporate-border)]">
        <div className="flex items-center gap-2">
          <Video className="w-3.5 h-3.5 text-accent shrink-0" />
          <div>
            <span className="text-xs font-bold text-[var(--color-corporate-text)]">{cam.label}</span>
            <span className="text-[10px] text-[var(--color-corporate-text-muted)] ml-1.5">{cam.desc}</span>
          </div>
          {isActive && (
            <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 uppercase tracking-wide">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {counts && (
            <span className="text-[10px] tabular-nums text-[var(--color-corporate-text-muted)] bg-[var(--color-corporate-muted)] px-1.5 py-0.5 rounded-full border border-[var(--color-corporate-border)]">
              {counts.fps} FPS
            </span>
          )}
          <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
            connected
              ? 'text-green-600 border-green-300 bg-green-50'
              : 'text-red-500 border-red-300 bg-red-50'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>
          {connected && (
            <button onClick={handleReset} title="Reset counters"
              className="p-1 rounded-full border border-[var(--color-corporate-border)] text-[var(--color-corporate-text-muted)] hover:text-accent hover:border-accent transition-colors cursor-pointer">
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => setStreamKey(k => k + 1)} title="Reload stream"
            className="p-1 rounded-full border border-[var(--color-corporate-border)] text-[var(--color-corporate-text-muted)] hover:text-accent hover:border-accent transition-colors cursor-pointer">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Video + Signal Panel ── */}
      <div className="flex">

        {/* Video feed */}
        <div className="bg-black relative flex-1 min-w-0">
          {imgSrc ? (
            <>
              <img
                src={imgSrc}
                alt={`${cam.label} live feed`}
                className="w-full block"
                style={{ maxHeight: 'min(240px, 40vw)', objectFit: 'contain' }}
              />
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE · YOLOv8
              </div>
              <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-md font-mono">
                {onScreen} on screen
              </div>
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-md font-mono">
                Total: {grandTotal}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center bg-[var(--color-corporate-muted)]" style={{ height: 'min(180px, 35vw)' }}>
              <div className="text-center">
                <Video className="w-8 h-8 text-[var(--color-corporate-text-muted)] mx-auto mb-1" />
                <p className="text-xs text-[var(--color-corporate-text-muted)]">AI server offline</p>
              </div>
            </div>
          )}
        </div>

        {/* Signal panel */}
        <div style={{ background: '#0f172a' }} className="w-16 sm:w-[76px] shrink-0 flex flex-col items-center justify-between py-3 px-1.5 sm:px-2 gap-2">
          <TrafficLight signal={signal} />

          {/* Signal badge */}
          <div style={{ background: sigStyle.bg, color: sigStyle.text, border: `1px solid ${sigStyle.border}` }}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full w-full text-center">
            {signal ?? '—'}
          </div>

          {/* Countdown */}
          {signalState && isActive && (
            <div className="text-center">
              <p className="text-white text-lg font-bold tabular-nums leading-none">{Math.ceil(timeLeft)}s</p>
              <p className="text-[9px] text-slate-400 mt-0.5">remaining</p>
            </div>
          )}

          {/* Wait time */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400">wait</p>
            <p className="text-white text-xs font-semibold tabular-nums">{Math.round(waitTime)}s</p>
          </div>

          {/* Override indicator */}
          {override && (
            <div className="text-[9px] font-bold text-amber-400 text-center leading-tight">{override}</div>
          )}
        </div>
      </div>

      {/* ── Override buttons ── */}
      {signalState && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 px-2 pt-2 pb-1">
          <button
            onClick={() => onOverride(cam.id, 'FORCE_GREEN')}
            className="text-[10px] font-semibold py-1.5 px-1 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors cursor-pointer truncate"
          >
            Force Green
          </button>
          <button
            onClick={() => onOverride(cam.id, 'HOLD_RED')}
            className="text-[10px] font-semibold py-1.5 px-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors cursor-pointer truncate"
          >
            Hold Red
          </button>
          <button
            onClick={() => onOverride(cam.id, 'EXTEND')}
            className="text-[10px] font-semibold py-1.5 px-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            +10s
          </button>
          <button
            onClick={() => onOverride(cam.id, 'CLEAR')}
            className="text-[10px] font-semibold py-1.5 px-1 rounded border border-[var(--color-corporate-border)] bg-[var(--color-corporate-muted)] text-[var(--color-corporate-text-muted)] hover:text-[var(--color-corporate-text)] transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Per-type mini stats ── */}
      <div className="grid grid-cols-2 gap-1.5 p-2.5 pt-1.5">
        {VEHICLE_META.map(meta => {
          const total = counts?.total[meta.key]     ?? 0;
          const onSc  = counts?.on_screen[meta.key] ?? 0;
          const pct   = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
          return (
            <div key={meta.key}
              className="rounded-lg p-2 border border-[var(--color-corporate-border)] bg-[var(--color-corporate-muted)]">
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ color: meta.color }}>{meta.icon}</span>
                <span className="text-[10px] font-semibold text-[var(--color-corporate-text)] truncate">{meta.label}</span>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-base font-bold tabular-nums" style={{ color: meta.color }}>{total}</p>
                <span className="text-[9px] text-[var(--color-corporate-text-muted)]">{onSc} now</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-[var(--color-corporate-border)] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: meta.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Grand total strip ─────────────────────────────────────────────────────────
function TotalStrip({ signalState }: { signalState: SignalState | null }) {
  const [agg, setAgg]       = useState<CountsResponse | null>(null);
  const [online, setOnline] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const [aggR, camR] = await Promise.all([
          fetch(`${BACKEND}/api/counts`),
          fetch(`${BACKEND}/api/cameras`),
        ]);
        if (aggR.ok) setAgg(await aggR.json());
        if (camR.ok) {
          const cams = await camR.json();
          setOnline(cams.filter((c: { source: string | null }) => c.source && c.source !== 'none').length);
        }
      } catch { /* backend offline */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  if (!agg) return null;

  return (
    <div className="card-light px-5 py-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-accent shrink-0" />
          <div>
            <p className="text-xs text-[var(--color-corporate-text-muted)] font-medium uppercase tracking-wide">
              All cameras — total vehicles counted
            </p>
            <p className="font-heading text-3xl font-bold text-[var(--color-corporate-text)] tabular-nums">
              {agg.grand_total.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Signal stats from AI controller */}
        {signalState && (
          <>
            <div className="flex flex-col items-center">
              <p className="text-xs text-[var(--color-corporate-text-muted)]">Efficiency</p>
              <p className="text-lg font-bold tabular-nums text-green-600">{signalState.efficiency}%</p>
            </div>
            <div className="flex flex-col items-center">
              <p className="text-xs text-[var(--color-corporate-text-muted)]">Avg Wait</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-corporate-text)]">{Math.round(signalState.avg_wait)}s</p>
            </div>
            <div className="flex flex-col items-center">
              <p className="text-xs text-[var(--color-corporate-text-muted)]">Cycle #</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-corporate-text)]">{signalState.cycle_count}</p>
            </div>
            <div className="flex flex-col items-center">
              <p className="text-xs text-[var(--color-corporate-text-muted)]">Throughput</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-corporate-text)]">{signalState.throughput}</p>
            </div>
          </>
        )}

        <div className="flex items-center gap-4 ml-auto">
          <span className="text-xs text-[var(--color-corporate-text-muted)]">
            {online} / {CAMERAS.length} cameras active
          </span>
          {VEHICLE_META.map(meta => (
            <div key={meta.key} className="text-center hidden sm:block">
              <p className="text-sm font-bold tabular-nums" style={{ color: meta.color }}>
                {agg.total[meta.key] ?? 0}
              </p>
              <p className="text-[9px] text-[var(--color-corporate-text-muted)]">{meta.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Cycle Timeline ────────────────────────────────────────────────────────────
function CycleTimeline({ signalState }: { signalState: SignalState | null }) {
  if (!signalState) return null;

  const phasePct = signalState.phase_duration > 0
    ? Math.min(100, (signalState.phase_elapsed / signalState.phase_duration) * 100)
    : 0;

  const phaseColor =
    signalState.phase === 'GREEN'    ? '#16a34a' :
    signalState.phase === 'YELLOW'   ? '#b45309' :
    signalState.phase === 'ALL_RED'  ? '#dc2626' : '#64748b';

  return (
    <div className="card-light px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-[var(--color-corporate-text)]">Signal Cycle</span>
          {signalState.emergency && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 animate-pulse">
              EMERGENCY
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-corporate-text-muted)]">
          <span>Phase: <strong className="text-[var(--color-corporate-text)]">{signalState.phase}</strong></span>
          <span className="tabular-nums">{Math.ceil(signalState.time_remaining)}s remaining</span>
        </div>
      </div>

      {/* Phase progress bar */}
      <div className="h-2 rounded-full bg-[var(--color-corporate-border)] overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${phasePct}%`, background: phaseColor }}
        />
      </div>

      {/* Per-lane scores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CAMERAS.map(cam => {
          const camStr = String(cam.id);
          const sig    = signalState.signals[camStr];
          const score  = signalState.scores[camStr] ?? 0;
          const wait   = signalState.wait_times[camStr] ?? 0;
          const active = signalState.active_cam === cam.id;
          const ov     = signalState.overrides[camStr];
          const ss     = SIG_STYLE[sig ?? 'RED'];
          return (
            <div key={cam.id}
              className="rounded-lg p-2.5 border text-center"
              style={{
                borderColor: active ? phaseColor : 'var(--color-corporate-border)',
                background:  active ? ss.bg      : 'var(--color-corporate-muted)',
              }}>
              <p className="text-[10px] font-semibold text-[var(--color-corporate-text-muted)] mb-1">{cam.label}</p>
              <div style={{ color: ss.text }}
                className="text-xs font-bold mb-1">{sig ?? '—'}</div>
              <p className="text-[10px] text-[var(--color-corporate-text-muted)]">
                score <span className="font-mono font-bold text-[var(--color-corporate-text)]">{Math.round(score)}</span>
              </p>
              <p className="text-[10px] text-[var(--color-corporate-text-muted)]">
                wait <span className="font-mono font-bold">{Math.round(wait)}s</span>
              </p>
              {ov && <p className="text-[9px] font-bold text-amber-600 mt-0.5">{ov}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function CameraFeed() {
  const [signalState, setSignalState] = useState<SignalState | null>(null);
  // Incrementing this forces every CameraCell to restart its snapshot polling
  const [mountKey, setMountKey] = useState(0);

  const fetchSignal = async () => {
    try {
      const r = await fetch(`${BACKEND}/api/signals`);
      if (r.ok) setSignalState(await r.json());
    } catch { /* backend offline */ }
  };

  useEffect(() => {
    fetchSignal();
    const t = setInterval(fetchSignal, 500);

    // Re-fetch and force camera reload whenever the tab becomes visible
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchSignal();
        setMountKey(k => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleOverride = async (camId: number, action: string) => {
    try {
      await fetch(`${BACKEND}/api/signals/override`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cam_id: camId, action }),
      });
    } catch { /* ignore */ }
  };

  const handleEmergency = async () => {
    try {
      await fetch(`${BACKEND}/api/signals/override`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cam_id: 1, action: 'EMERGENCY' }),
      });
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">
            <span className="section-label-num">05</span>
            <span>—</span>
            <span>Camera feeds</span>
          </p>
          <h2 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] mt-1 flex items-center gap-2">
            <Video className="w-5 h-5 text-accent" />
            Live Traffic Detection — 4 Cameras
          </h2>
          <p className="text-sm text-[var(--color-corporate-text-muted)] mt-0.5">
            YOLOv8 · Cars · Rickshaws · Bikes · Buses · Trucks — Lahore road traffic
          </p>
        </div>

        {/* Signal status + Emergency stop */}
        <div className="flex items-center gap-3 shrink-0">
          {signalState && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-corporate-text-muted)]">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span>AI Signal: </span>
              <span className="font-semibold text-[var(--color-corporate-text)]">
                {signalState.phase} · Cycle #{signalState.cycle_count}
              </span>
            </div>
          )}
          <button
            onClick={handleEmergency}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Emergency Stop
          </button>
        </div>
      </div>

      {/* Offline notice */}
      <div id="cam-offline-notice" className="hidden card-light p-4 border-l-4 border-l-red-400">
        <p className="text-sm font-semibold text-red-600 mb-1">AI detection server not running</p>
        <code className="block text-xs bg-[var(--color-corporate-muted)] border border-[var(--color-corporate-border)] rounded-lg px-4 py-2.5 font-mono text-[var(--color-corporate-text)]">
          .venv\Scripts\python.exe ai_module\vehicle_counter.py
        </code>
      </div>

      {/* Grand total strip */}
      <TotalStrip signalState={signalState} />

      {/* Cycle timeline */}
      <CycleTimeline signalState={signalState} />

      {/* 2×2 Camera grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CAMERAS.map(cam => (
          <CameraCell
            key={`${cam.id}-${mountKey}`}
            cam={cam}
            signalState={signalState}
            onOverride={handleOverride}
          />
        ))}
      </div>

    </div>
  );
}
