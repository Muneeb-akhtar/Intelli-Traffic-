import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity, Zap, Car, Bike, Bus, Truck,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle, Info, AlertCircle, Video, ShieldAlert,
  Clock, BarChart2, RefreshCw,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

const BACKEND = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8081';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CountsPayload {
  total: Record<string, number>;
  on_screen: Record<string, number>;
  fps: number;
  grand_total: number;
}
interface HistoryPoint {
  ts: number;
  on_screen: number;
  types: Record<string, number>;
}
interface SignalState {
  signals: Record<string, 'RED' | 'YELLOW' | 'GREEN'>;
  active_cam: number | null;
  phase: string;
  phase_elapsed: number;
  phase_duration: number;
  time_remaining: number;
  scores: Record<string, number>;
  wait_times: Record<string, number>;
  overrides: Record<string, string | null>;
  emergency: boolean;
  cycle_count: number;
  throughput: number;
  avg_wait: number;
  efficiency: number;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#f8fafc',
  card:      '#ffffff',
  cardAlt:   '#f1f5f9',
  border:    '#e2e8f0',
  borderLt:  '#cbd5e1',
  text:      '#0f172a',
  muted:     '#64748b',
  dim:       '#94a3b8',
  accent:    '#2563eb',
  green:     '#16a34a',
  amber:     '#b45309',
  red:       '#dc2626',
  greenDim:  '#f0fdf4',
  amberDim:  '#fffbeb',
  redDim:    '#fef2f2',
};

const CAMERAS = [
  { id: 1, label: 'Lane 1', desc: 'Lahore Road' },
  { id: 2, label: 'Lane 2', desc: 'Main Boulevard' },
  { id: 3, label: 'Lane 3', desc: 'Single Lane A' },
  { id: 4, label: 'Lane 4', desc: 'Single Lane B' },
];

const VEHICLE_META = [
  { key: 'Car',           label: 'Cars',             icon: <Car   className="w-4 h-4" />, color: '#60a5fa' },
  { key: 'Rickshaw/Bike', label: 'Rickshaws & Bikes', icon: <Bike  className="w-4 h-4" />, color: '#a78bfa' },
  { key: 'Bus/Metro',     label: 'Buses & Metro',    icon: <Bus   className="w-4 h-4" />, color: '#34d399' },
  { key: 'Truck',         label: 'Trucks',            icon: <Truck className="w-4 h-4" />, color: '#fb923c' },
] as const;

// ── Traffic Light ─────────────────────────────────────────────────────────────
function TrafficLight({ signal, size = 'md' }: {
  signal?: 'RED' | 'YELLOW' | 'GREEN';
  size?: 'sm' | 'md';
}) {
  const w  = size === 'sm' ? 22 : 30;
  const h  = size === 'sm' ? 62 : 84;
  const cx = w / 2;
  const r  = size === 'sm' ? 7  : 9;
  const y1 = size === 'sm' ? 11 : 14;
  const g  = size === 'sm' ? 20 : 28;

  const fill = (active: boolean, col: string) =>
    active ? col : col + '28';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="5"
        fill="#1e293b" stroke={C.border} strokeWidth="1" />
      <circle cx={cx} cy={y1}      r={r} fill={fill(signal === 'RED',    C.red)}   />
      <circle cx={cx} cy={y1 + g}  r={r} fill={fill(signal === 'YELLOW', C.amber)} />
      <circle cx={cx} cy={y1 + g * 2} r={r} fill={fill(signal === 'GREEN',  C.green)} />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcTrend(history: HistoryPoint[]): 'rising' | 'falling' | 'stable' {
  if (history.length < 6) return 'stable';
  const s = history.slice(-10);
  const d = s[s.length - 1].on_screen - s[0].on_screen;
  return d > 3 ? 'rising' : d < -3 ? 'falling' : 'stable';
}

function buildSuggestions(counts: CountsPayload, trend: string, peak: number) {
  const out: { level: string; text: string }[] = [];
  const on = Object.values(counts.on_screen).reduce((a, b) => a + b, 0);
  if (on > 25)      out.push({ level: 'alert',   text: 'High vehicle density — activate alternate signal phases to reduce congestion.' });
  else if (on > 15) out.push({ level: 'warning', text: 'Moderate load. Monitor closely for build-up.' });
  else              out.push({ level: 'ok',       text: 'Traffic flowing smoothly. No intervention required.' });
  if (trend === 'rising')  out.push({ level: 'warning', text: 'Traffic is building. Consider extending green phase for the busiest lane.' });
  if (trend === 'falling') out.push({ level: 'ok',      text: 'Traffic is easing. Normal signal timing can resume.' });
  const r = counts.on_screen['Rickshaw/Bike'] ?? 0, c = counts.on_screen['Car'] ?? 0;
  if (r > c && r > 5) out.push({ level: 'info', text: 'Two-wheelers dominant. Prioritise narrow lane clearance.' });
  if ((counts.on_screen['Bus/Metro'] ?? 0) > 3) out.push({ level: 'info', text: 'Multiple buses detected — extend green window for safe clearance.' });
  if ((counts.on_screen['Truck'] ?? 0) > 2)     out.push({ level: 'warning', text: 'Heavy vehicles present. Adjust timing for slower acceleration.' });
  if (peak > 30)          out.push({ level: 'info', text: `Session peak: ${peak} vehicles. Use as capacity baseline for calibration.` });
  if (counts.grand_total > 200) out.push({ level: 'info', text: `${counts.grand_total.toLocaleString()} vehicles counted this session.` });
  return out;
}

// ── Small reusable UI ─────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: C.border }} />;
}

function SectionLabel({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: C.muted }}>{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>{title}</span>
      {sub && <span className="text-[10px]" style={{ color: C.dim }}>— {sub}</span>}
    </div>
  );
}

function SuggestionRow({ level, text }: { level: string; text: string }) {
  const cfg: Record<string, { icon: React.ReactNode; accent: string }> = {
    alert:   { icon: <AlertCircle   className="w-3.5 h-3.5 shrink-0 mt-px" />, accent: C.red   },
    warning: { icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />, accent: C.amber },
    info:    { icon: <Info           className="w-3.5 h-3.5 shrink-0 mt-px" />, accent: C.accent },
    ok:      { icon: <CheckCircle   className="w-3.5 h-3.5 shrink-0 mt-px" />, accent: C.green },
  };
  const { icon, accent } = cfg[level] ?? cfg.info;
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded text-xs"
      style={{ background: C.cardAlt, borderLeft: `2px solid ${accent}`, color: C.text }}>
      <span style={{ color: accent }}>{icon}</span>
      <span style={{ color: '#94a3b8' }}>{text}</span>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <span style={{ color: accent ?? C.muted }}>{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: accent ?? C.text }}>{value}</p>
        {sub && <p className="text-[10px]" style={{ color: C.dim }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Vehicle stat card ─────────────────────────────────────────────────────────
function VehicleStatCard({ meta, total, onScreen, grandTotal }: {
  meta: typeof VEHICLE_META[number]; total: number; onScreen: number; grandTotal: number;
}) {
  const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${meta.color}` }}>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span className="text-xs font-semibold" style={{ color: C.text }}>{meta.label}</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ background: C.cardAlt, color: C.muted }}>
            {onScreen} on screen
          </span>
        </div>
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-3xl font-bold tabular-nums" style={{ color: C.text }}>{total.toLocaleString()}</p>
            <p className="text-[10px]" style={{ color: C.muted }}>total counted</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums" style={{ color: meta.color }}>{pct}%</p>
            <p className="text-[10px]" style={{ color: C.muted }}>share</p>
          </div>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: C.border }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: meta.color }} />
        </div>
      </div>
    </div>
  );
}

// ── Camera tile ───────────────────────────────────────────────────────────────
function CameraTile({ cam, connected, signals, onOverride }: {
  cam: typeof CAMERAS[0];
  connected: boolean | null;
  signals: SignalState | null;
  onOverride: (camId: number, action: string) => void;
}) {
  const [counts,   setCounts]   = useState<CountsPayload | null>(null);
  const [imgSrc,   setImgSrc]   = useState('');
  const [hasFrame, setHasFrame] = useState(false);

  const sig       = (signals?.signals[String(cam.id)] ?? 'RED') as 'RED' | 'YELLOW' | 'GREEN';
  const isActive  = signals?.active_cam === cam.id;
  const remaining = isActive ? Math.round(signals?.time_remaining ?? 0) : 0;
  const waitTime  = Math.round(signals?.wait_times[String(cam.id)] ?? 0);
  const score     = Math.round(signals?.scores[String(cam.id)] ?? 0);
  const override  = signals?.overrides[String(cam.id)] ?? null;

  const sigColor  = sig === 'GREEN' ? C.green : sig === 'YELLOW' ? C.amber : C.red;

  useEffect(() => {
    let alive = true;
    let failStreak = 0;
    const INTERVAL = 100;  // 10 FPS target
    const TIMEOUT  = 6000;
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND}/snapshot/${cam.id}?t=${Date.now()}`, { signal: AbortSignal.timeout(TIMEOUT) });
        if (r.ok && alive) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          setImgSrc(prev => { URL.revokeObjectURL(prev); return url; });
          setHasFrame(true);
          failStreak = 0;
        }
      } catch {
        failStreak++;
        if (failStreak >= 5 && alive) setHasFrame(false);
      }
      if (alive) setTimeout(tick, INTERVAL);
    };
    tick();
    return () => { alive = false; };
  }, [cam.id]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/counts/${cam.id}`, { signal: AbortSignal.timeout(3000) });
        if (r.ok && alive) setCounts(await r.json());
      } catch { /* silent */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [cam.id]);

  const onScreen   = counts ? Object.values(counts.on_screen).reduce((a, b) => a + b, 0) : 0;
  const grandTotal = counts?.grand_total ?? 0;

  return (
    <div className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${sigColor}` }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <Video className="w-3.5 h-3.5" style={{ color: C.muted }} />
          <span className="text-xs font-semibold" style={{ color: C.text }}>{cam.label}</span>
          <span className="text-[10px]" style={{ color: C.muted }}>/ {cam.desc}</span>
        </div>
        <div className="flex items-center gap-2">
          {counts && (
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>{grandTotal} counted</span>
          )}
          <span className="text-[10px] font-bold px-2 py-0.5 rounded font-mono"
            style={{ background: sigColor + '18', color: sigColor }}>
            {sig}{isActive && remaining > 0 ? ` ${remaining}s` : ''}
          </span>
        </div>
      </div>

      {/* Video + Light panel */}
      <div className="flex" style={{ background: '#0f172a' }}>
        {/* Snapshot */}
        <div className="flex-1 relative" style={{ minHeight: 'min(200px, 38vw)' }}>
          {hasFrame && imgSrc ? (
            <img src={imgSrc} alt={cam.label} className="w-full block"
              style={{ height: 'min(200px, 38vw)', objectFit: 'contain' }} />
          ) : (
            <div className="flex items-center justify-center" style={{ height: 'min(200px, 38vw)' }}>
              {connected
                ? <RefreshCw className="w-5 h-5 animate-spin" style={{ color: C.dim }} />
                : <p className="text-xs" style={{ color: C.dim }}>Connecting…</p>}
            </div>
          )}
          {/* Overlays */}
          {hasFrame && (
            <>
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.red }} />
                LIVE
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#94a3b8' }}>
                {onScreen} on screen
              </div>
            </>
          )}
        </div>

        {/* Traffic light + controls */}
        <div className="flex flex-col items-center justify-between py-3 px-1.5 sm:px-2.5 gap-2 sm:gap-3 w-16 sm:w-[90px] shrink-0"
          style={{ borderLeft: `1px solid #1e293b`, background: '#0f172a' }}>
          <TrafficLight signal={sig} size="md" />

          <div className="text-center space-y-0.5">
            {isActive && remaining > 0 ? (
              <div className="flex items-center gap-1 justify-center">
                <Clock className="w-3 h-3" style={{ color: C.muted }} />
                <span className="text-sm font-bold tabular-nums" style={{ color: C.text }}>{remaining}s</span>
              </div>
            ) : (
              <p className="text-[10px]" style={{ color: C.muted }}>
                Wait <span className="font-mono" style={{ color: C.text }}>{waitTime}s</span>
              </p>
            )}
            <p className="text-[10px]" style={{ color: C.dim }}>
              Score <span className="font-mono" style={{ color: C.muted }}>{score}</span>
            </p>
          </div>

          {/* Override buttons */}
          {connected && (
            <div className="flex flex-col gap-1 w-full">
              {override ? (
                <>
                  <div className="text-[9px] text-center font-bold py-0.5 rounded"
                    style={{ background: override === 'FORCE_GREEN' ? C.greenDim : C.redDim,
                             color: override === 'FORCE_GREEN' ? C.green : C.red }}>
                    {override === 'FORCE_GREEN' ? 'FORCED' : 'HELD'}
                  </div>
                  <button onClick={() => onOverride(cam.id, 'CLEAR')}
                    className="text-[10px] w-full py-1 rounded cursor-pointer transition-colors"
                    style={{ border: `1px solid ${C.borderLt}`, color: C.muted, background: 'transparent' }}>
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => onOverride(cam.id, 'FORCE_GREEN')}
                    className="text-[10px] w-full py-1 rounded cursor-pointer transition-colors"
                    style={{ border: `1px solid ${C.green}44`, color: C.green, background: 'transparent' }}>
                    Force Green
                  </button>
                  <button onClick={() => onOverride(cam.id, 'HOLD_RED')}
                    className="text-[10px] w-full py-1 rounded cursor-pointer transition-colors"
                    style={{ border: `1px solid ${C.red}44`, color: C.red, background: 'transparent' }}>
                    Hold Red
                  </button>
                  {isActive && (
                    <button onClick={() => onOverride(cam.id, 'EXTEND')}
                      className="text-[10px] w-full py-1 rounded cursor-pointer transition-colors"
                      style={{ border: `1px solid ${C.amber}44`, color: C.amber, background: 'transparent' }}>
                      + 10s
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cycle timeline ────────────────────────────────────────────────────────────
function CycleTimeline({ signals }: { signals: SignalState | null }) {
  if (!signals) return null;
  return (
    <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel icon={<BarChart2 className="w-3.5 h-3.5" />} title="Signal Cycle Timeline"
          sub={`Cycle #${signals.cycle_count} · ${signals.phase}`} />
        {signals.emergency && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded animate-pulse"
            style={{ background: C.redDim, color: C.red }}>ALL RED — EMERGENCY</span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {CAMERAS.map(cam => {
          const sig      = signals.signals[String(cam.id)] as 'RED' | 'YELLOW' | 'GREEN';
          const isActive = signals.active_cam === cam.id;
          const pct      = isActive && signals.phase_duration > 0
            ? Math.min(100, (signals.phase_elapsed / signals.phase_duration) * 100) : 0;
          const wait     = Math.round(signals.wait_times[String(cam.id)] ?? 0);
          const score    = Math.round(signals.scores[String(cam.id)] ?? 0);
          const sigColor = sig === 'GREEN' ? C.green : sig === 'YELLOW' ? C.amber : C.border;

          return (
            <div key={cam.id} className="flex items-center gap-3">
              <TrafficLight signal={sig} size="sm" />
              <div style={{ width: 80, flexShrink: 0 }}>
                <p className="text-xs font-semibold" style={{ color: C.text }}>{cam.label}</p>
                <p className="text-[10px]" style={{ color: C.muted }}>{cam.desc}</p>
              </div>

              <div className="flex-1 relative rounded-full overflow-hidden"
                style={{ height: 8, background: C.cardAlt, border: `1px solid ${C.border}` }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: sigColor }} />
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-mono tabular-nums w-16 text-right" style={{ color: sigColor || C.muted }}>
                  {isActive ? `${Math.round(signals.time_remaining)}s left`
                    : sig === 'YELLOW' ? 'Switching'
                    : `${wait}s wait`}
                </span>
                <span className="text-[10px] font-mono w-10 text-right" style={{ color: C.dim }}>#{score}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3"
        style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-4 text-[10px]" style={{ color: C.muted }}>
          <span>Efficiency <strong style={{ color: C.text }}>{signals.efficiency}%</strong></span>
          <span>Avg wait <strong style={{ color: C.text }}>{signals.avg_wait}s</strong></span>
          <span>Throughput <strong style={{ color: C.text }}>{signals.throughput} veh/min</strong></span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[10px]" style={{ color: C.dim }}>
          {[['Active', C.green], ['Switching', C.amber], ['Waiting', C.border]].map(([lbl, col]) => (
            <div key={lbl} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: col }} />
              <span>{lbl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StreamlitDashboard() {
  const [counts,    setCounts]    = useState<CountsPayload | null>(null);
  const [history,   setHistory]   = useState<HistoryPoint[]>([]);
  const [signals,   setSignals]   = useState<SignalState | null>(null);
  // null = connecting, true = online, false = confirmed offline
  const [connected, setConnected] = useState<boolean | null>(null);
  const failCount  = useRef(0);
  const startedAt  = useRef(Date.now());

  useEffect(() => {
    let alive = true;

    // Always reset to connecting state on mount so stale HMR state doesn't persist
    setConnected(null);
    failCount.current = 0;
    startedAt.current = Date.now();

    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/counts`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error('not ok');
        const data = await r.json();
        if (alive) {
          setCounts(data);
          failCount.current = 0;
          setConnected(true);
        }
      } catch {
        if (!alive) return;
        failCount.current += 1;
        // Only go offline after 3 consecutive fails AND at least 6s since mount
        if (failCount.current >= 3 && Date.now() - startedAt.current > 6000) {
          setConnected(false);
        }
      }
    };

    poll();
    const id = setInterval(poll, 1500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/history`, { signal: AbortSignal.timeout(4000) });
        if (r.ok && alive) setHistory(await r.json());
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/signals`, { signal: AbortSignal.timeout(3000) });
        if (r.ok && alive) setSignals(await r.json());
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 700);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const handleOverride = useCallback((camId: number | null, action: string) => {
    fetch(`${BACKEND}/api/signals/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cam_id: camId, action }),
    }).catch(() => {});
  }, []);

  const trend    = useMemo(() => calcTrend(history), [history]);
  const peak     = useMemo(() => history.length ? Math.max(...history.map(h => h.on_screen)) : 0, [history]);
  const suggests = useMemo(() => counts ? buildSuggestions(counts, trend, peak) : [], [counts, trend, peak]);
  const grandTotal    = counts?.grand_total ?? 0;
  const totalOnScreen = counts ? Object.values(counts.on_screen).reduce((a, b) => a + b, 0) : 0;

  const chartData = history.map((h, i) => ({
    t: i, vehicles: h.on_screen,
    Car: h.types['Car'] ?? 0,
    'Rick/Bike': h.types['Rickshaw/Bike'] ?? 0,
    Bus: h.types['Bus/Metro'] ?? 0,
    Truck: h.types['Truck'] ?? 0,
  }));

  const trendColor = trend === 'rising' ? C.red : trend === 'falling' ? C.green : C.muted;
  const TrendIco   = trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus;

  return (
    <div className="flex flex-col gap-3 sm:gap-4 rounded-xl p-3 sm:p-5"
      style={{ background: C.bg, border: `1px solid ${C.border}` }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-5 rounded-full" style={{ background: C.accent }} />
            <h2 className="text-base font-bold tracking-tight" style={{ color: C.text }}>
              Traffic Control Operations
            </h2>
          </div>
          <p className="text-xs pl-4" style={{ color: C.muted }}>
            AI signal management · YOLOv8 detection · 4 live lanes
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {signals && (
            <span className="text-[10px] font-mono px-2 py-1 rounded"
              style={{ background: C.cardAlt, color: C.muted, border: `1px solid ${C.border}` }}>
              Cycle #{signals.cycle_count}
            </span>
          )}
          {counts && (
            <span className="text-[10px] font-mono px-2 py-1 rounded"
              style={{ background: C.cardAlt, color: C.muted, border: `1px solid ${C.border}` }}>
              {counts.fps} fps
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded`}
            style={{
              background: connected === true ? C.green + '14' : connected === null ? C.muted + '30' : C.red + '14',
              color:      connected === true ? C.green           : connected === null ? C.muted        : C.red,
              border: `1px solid ${connected === true ? C.green : connected === null ? C.muted : C.red}33`,
            }}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected !== true ? 'animate-pulse' : ''}`}
              style={{ background: connected === true ? C.green : connected === null ? C.muted : C.red }} />
            {connected === true ? 'Operational' : connected === null ? 'Connecting…' : 'Offline'}
          </span>
          <button
            onClick={() => handleOverride(null, 'EMERGENCY')}
            className="flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: signals?.emergency ? C.redDim : 'transparent',
              border: `1px solid ${C.red}55`,
              color: C.red,
            }}>
            <ShieldAlert className="w-3.5 h-3.5" />
            {signals?.emergency ? 'Cancel Emergency' : 'Emergency Stop'}
          </button>
        </div>
      </div>

      <Divider />

      {/* ── Connecting / Offline ── */}
      {connected === null && (
        <div className="rounded p-4 flex items-center gap-3" style={{ background: C.cardAlt, border: `1px solid ${C.border}` }}>
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" style={{ color: C.muted }} />
          <p className="text-xs" style={{ color: C.muted }}>Connecting to AI backend…</p>
        </div>
      )}
      {connected === false && (
        <div className="rounded p-4" style={{ background: C.cardAlt, borderLeft: `3px solid ${C.red}` }}>
          <p className="text-xs font-semibold mb-2" style={{ color: C.red }}>Detection server not running</p>
          <code className="text-[11px] font-mono block px-3 py-2 rounded"
            style={{ background: '#0f172a', color: '#4ade80', border: `1px solid ${C.border}` }}>
            .venv\Scripts\python.exe ai_module\vehicle_counter.py
          </code>
        </div>
      )}

      {/* ── Stats strip ── */}
      {connected === true && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCard icon={<TrendingUp className="w-4 h-4" />}  label="Total Counted" value={grandTotal.toLocaleString()} accent={C.accent} />
          <StatCard icon={<Activity   className="w-4 h-4" />}  label="On Screen"     value={String(totalOnScreen)} />
          <StatCard icon={<TrendIco   className="w-4 h-4" />}  label="Trend"         value={trend.charAt(0).toUpperCase() + trend.slice(1)} accent={trendColor} />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Peak Session" value={String(peak)} />
          <StatCard icon={<BarChart2  className="w-4 h-4" />}  label="Efficiency"    value={signals ? `${signals.efficiency}%` : '—'} />
          <StatCard icon={<Clock      className="w-4 h-4" />}  label="Avg Wait"      value={signals ? `${signals.avg_wait}s` : '—'} />
        </div>
      )}

      {/* ── Camera grid ── */}
      <div>
        <SectionLabel icon={<Video className="w-3.5 h-3.5" />}
          title="Live Camera Feeds"
          sub="YOLOv8 detection with adaptive signal control" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {CAMERAS.map(cam => (
            <CameraTile key={cam.id} cam={cam} connected={connected}
              signals={signals} onOverride={handleOverride} />
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      <CycleTimeline signals={signals} />

      {/* ── Vehicle breakdown ── */}
      {connected === true && (
        <div>
          <SectionLabel icon={<BarChart2 className="w-3.5 h-3.5" />} title="Vehicle Breakdown" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
            {VEHICLE_META.map(meta => (
              <VehicleStatCard key={meta.key} meta={meta}
                total={counts?.total[meta.key] ?? 0}
                onScreen={counts?.on_screen[meta.key] ?? 0}
                grandTotal={grandTotal} />
            ))}
          </div>
        </div>
      )}

      {/* ── Flow chart ── */}
      {connected === true && chartData.length > 2 && (
        <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-4">
            <SectionLabel icon={<Activity className="w-3.5 h-3.5" />}
              title="Traffic Flow Record"
              sub={`All lanes combined · ${chartData.length} data points`} />
            <div className="flex items-center gap-1.5 text-xs" style={{ color: trendColor }}>
              <TrendIco className="w-3.5 h-3.5" />
              <span className="font-medium capitalize">{trend}</span>
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
            {[
              { label: 'Total',         color: C.accent   },
              { label: 'Cars',          color: '#3b82f6'  },
              { label: 'Rickshaw/Bike', color: '#8b5cf6'  },
              { label: 'Bus/Metro',     color: '#10b981'  },
              { label: 'Truck',         color: '#f97316'  },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: C.dim }}>
                <span className="inline-block w-5 h-[3px] rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.text, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                labelFormatter={() => ''}
              />
              <Line type="monotone" dataKey="vehicles"  stroke={C.accent}  strokeWidth={2.5} dot={false} name="Total"         activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Car"       stroke="#3b82f6"   strokeWidth={2}   dot={false} name="Cars"           activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Rick/Bike" stroke="#8b5cf6"   strokeWidth={2}   dot={false} name="Rickshaw/Bike"  activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Bus"       stroke="#10b981"   strokeWidth={2}   dot={false} name="Bus/Metro"      activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Truck"     stroke="#f97316"   strokeWidth={2}   dot={false} name="Truck"          activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Suggestions ── */}
      {connected === true && suggests.length > 0 && (
        <div>
          <SectionLabel icon={<Zap className="w-3.5 h-3.5" />} title="AI Recommendations" />
          <div className="flex flex-col gap-1.5 mt-3">
            {suggests.map((s, i) => <SuggestionRow key={i} level={s.level} text={s.text} />)}
          </div>
        </div>
      )}

    </div>
  );
}
