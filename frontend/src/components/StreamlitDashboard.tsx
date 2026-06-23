import { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, Zap, Car, Bike, Bus, Truck,
         RotateCcw, TrendingUp, TrendingDown, Minus,
         AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const COUNTER_URL = 'http://localhost:8081';

interface CountsPayload {
  total:       Record<string, number>;
  on_screen:   Record<string, number>;
  fps:         number;
  source:      string;
  grand_total: number;
}

interface HistoryPoint {
  ts:        number;
  on_screen: number;
  types:     Record<string, number>;
}

const VEHICLE_META = [
  { key: 'Car',           label: 'Cars',             icon: <Car   className="w-5 h-5" />, color: '#22c55e', bg: '#052e16' },
  { key: 'Rickshaw/Bike', label: 'Rickshaws & Bikes', icon: <Bike  className="w-5 h-5" />, color: '#f97316', bg: '#1c0a00' },
  { key: 'Bus/Metro',     label: 'Buses & Metro',    icon: <Bus   className="w-5 h-5" />, color: '#3b82f6', bg: '#0c1a3a' },
  { key: 'Truck',         label: 'Trucks',            icon: <Truck className="w-5 h-5" />, color: '#a855f7', bg: '#1a0a2e' },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function calcTrend(history: HistoryPoint[]): 'rising' | 'falling' | 'stable' {
  if (history.length < 6) return 'stable';
  const recent = history.slice(-10);
  const first  = recent[0].on_screen;
  const last   = recent[recent.length - 1].on_screen;
  if (last - first >  3) return 'rising';
  if (first - last >  3) return 'falling';
  return 'stable';
}

function peakHour(history: HistoryPoint[]): number {
  if (!history.length) return 0;
  return Math.max(...history.map(h => h.on_screen));
}

function buildSuggestions(
  counts: CountsPayload,
  trend: 'rising' | 'falling' | 'stable',
  peak: number,
) {
  const suggestions: { level: 'alert' | 'warning' | 'info' | 'ok'; text: string }[] = [];
  const on = Object.values(counts.on_screen).reduce((a, b) => a + b, 0);
  const total = counts.grand_total;

  if (on > 25) {
    suggestions.push({ level: 'alert', text: 'High vehicle density — consider activating alternate signal phases to reduce congestion.' });
  } else if (on > 15) {
    suggestions.push({ level: 'warning', text: 'Moderate traffic load. Monitor closely for build-up.' });
  } else {
    suggestions.push({ level: 'ok', text: 'Traffic is flowing smoothly. No intervention needed.' });
  }

  if (trend === 'rising') {
    suggestions.push({ level: 'warning', text: 'Traffic is building up. Peak congestion may be approaching — extend green phase for busiest lane.' });
  } else if (trend === 'falling') {
    suggestions.push({ level: 'ok', text: 'Traffic is easing. Normal signal timing can resume.' });
  }

  const rickshaws = counts.on_screen['Rickshaw/Bike'] ?? 0;
  const cars      = counts.on_screen['Car'] ?? 0;
  if (rickshaws > cars && rickshaws > 5) {
    suggestions.push({ level: 'info', text: 'Two-wheeler / rickshaw traffic is dominant. Prioritise narrow lane clearance and reduce phase gaps.' });
  }

  const buses = counts.on_screen['Bus/Metro'] ?? 0;
  if (buses > 3) {
    suggestions.push({ level: 'info', text: 'Multiple buses/metro vehicles detected. Ensure bus stop bays are clear and extend green window.' });
  }

  const trucks = counts.on_screen['Truck'] ?? 0;
  if (trucks > 2) {
    suggestions.push({ level: 'warning', text: 'Heavy vehicles (trucks) detected. Signal timing should account for slower acceleration.' });
  }

  if (peak > 30) {
    suggestions.push({ level: 'info', text: `Peak recorded at ${peak} vehicles on screen — consider this as capacity baseline for signal calibration.` });
  }

  if (total > 200) {
    suggestions.push({ level: 'info', text: `${total.toLocaleString()} vehicles counted since session start. Data available for export in the Reports tab.` });
  }

  return suggestions;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TrendIcon({ trend }: { trend: 'rising' | 'falling' | 'stable' }) {
  if (trend === 'rising')  return <TrendingUp   className="w-5 h-5 text-red-400"   />;
  if (trend === 'falling') return <TrendingDown  className="w-5 h-5 text-green-400" />;
  return                          <Minus         className="w-5 h-5 text-gray-400"  />;
}

function SuggestionRow({ level, text }: { level: string; text: string }) {
  const cfg = {
    alert:   { icon: <AlertCircle  className="w-4 h-4 shrink-0" />, cls: 'text-red-400   bg-red-500/10   border-red-500/20'   },
    warning: { icon: <AlertTriangle className="w-4 h-4 shrink-0" />, cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    info:    { icon: <Info          className="w-4 h-4 shrink-0" />, cls: 'text-blue-400  bg-blue-500/10  border-blue-500/20'  },
    ok:      { icon: <CheckCircle   className="w-4 h-4 shrink-0" />, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
  }[level] ?? { icon: <Info className="w-4 h-4 shrink-0" />, cls: 'text-gray-400 bg-white/5 border-white/10' };

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs ${cfg.cls}`}>
      {cfg.icon}
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function VehicleStatCard({ meta, total, onScreen, grandTotal }: {
  meta: typeof VEHICLE_META[number];
  total: number; onScreen: number; grandTotal: number;
}) {
  const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3 border"
      style={{ background: meta.bg, borderColor: meta.color + '33' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <span className="text-sm font-bold text-white">{meta.label}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: meta.color + '22', color: meta.color }}>
          {onScreen} on screen
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="font-heading text-4xl font-bold tabular-nums leading-none"
            style={{ color: meta.color }}>{total.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">total counted</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-300 tabular-nums">{pct}%</p>
          <p className="text-xs text-gray-600">of traffic</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: meta.color }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function StreamlitDashboard() {
  const [counts,    setCounts]    = useState<CountsPayload | null>(null);
  const [history,   setHistory]   = useState<HistoryPoint[]>([]);
  const [connected, setConnected] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

  // Poll counts
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${COUNTER_URL}/api/counts`, { signal: AbortSignal.timeout(2000) });
        if (!r.ok) throw new Error();
        const d: CountsPayload = await r.json();
        if (alive) { setCounts(d); setConnected(true); }
      } catch { if (alive) setConnected(false); }
    };
    poll();
    const id = setInterval(poll, 900);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Poll history every 3 s
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${COUNTER_URL}/api/history`, { signal: AbortSignal.timeout(2000) });
        if (r.ok && alive) setHistory(await r.json());
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const trend       = useMemo(() => calcTrend(history), [history]);
  const peak        = useMemo(() => peakHour(history),  [history]);
  const suggestions = useMemo(() => counts ? buildSuggestions(counts, trend, peak) : [], [counts, trend, peak]);

  const grandTotal    = counts?.grand_total ?? 0;
  const totalOnScreen = counts ? Object.values(counts.on_screen).reduce((a, b) => a + b, 0) : 0;

  // Chart data — label every point with a relative time
  const chartData = history.map((h, i) => ({
    t:          i,
    vehicles:   h.on_screen,
    Car:        h.types['Car'] ?? 0,
    'Rick/Bike':h.types['Rickshaw/Bike'] ?? 0,
    Bus:        h.types['Bus/Metro'] ?? 0,
    Truck:      h.types['Truck'] ?? 0,
  }));

  const trendLabel = trend === 'rising' ? 'Rising' : trend === 'falling' ? 'Falling' : 'Stable';
  const trendColor = trend === 'rising' ? '#f87171' : trend === 'falling' ? '#4ade80' : '#94a3b8';

  return (
    <div className="flex flex-col gap-5 bg-[#080a0e] rounded-2xl p-5 border border-white/5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h2 className="font-heading text-lg font-bold text-white">AI Traffic Analyser</h2>
          </div>
          <p className="text-xs text-gray-500">
            YOLOv8 · Lahore road traffic · live detection + trend analysis
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {connected && counts && (
            <span className="flex items-center gap-1.5 text-xs bg-white/5 text-gray-300 px-2.5 py-1 rounded-full">
              <Activity className="w-3 h-3 text-green-400" /> {counts.fps} fps
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium
            ${connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
          <button onClick={() => { setResetting(true); fetch(`${COUNTER_URL}/api/reset`, { method: 'POST' }).finally(() => setResetting(false)); }}
            disabled={resetting || !connected}
            className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 cursor-pointer">
            <RotateCcw className={`w-3 h-3 ${resetting ? 'animate-spin' : ''}`} /> Reset
          </button>
        </div>
      </div>

      {/* Offline */}
      {!connected && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-400 mb-1">Vehicle counter is not running</p>
          <p className="text-xs text-gray-500 mb-2">Start it from the project root:</p>
          <code className="text-xs bg-black/60 text-green-400 px-3 py-2 rounded-lg block font-mono">
            .venv\Scripts\python.exe ai_module\vehicle_counter.py
          </code>
        </div>
      )}

      {/* Stats strip */}
      {connected && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-accent shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total counted</p>
              <p className="font-heading text-2xl font-bold text-white tabular-nums">{grandTotal.toLocaleString()}</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
            <Activity className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">On screen</p>
              <p className="font-heading text-2xl font-bold text-white tabular-nums">{totalOnScreen}</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
            <TrendIcon trend={trend} />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Trend</p>
              <p className="font-heading text-2xl font-bold tabular-nums" style={{ color: trendColor }}>{trendLabel}</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Peak (session)</p>
              <p className="font-heading text-2xl font-bold text-white tabular-nums">{peak}</p>
            </div>
          </div>
        </div>
      )}

      {/* Video + type cards */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">
        <div className="rounded-xl overflow-hidden bg-black border border-white/10 relative">
          <img key={streamKey} src={`${COUNTER_URL}/video`} alt="AI detection"
            className="w-full block" style={{ minHeight: 260, maxHeight: 460, objectFit: 'contain' }}
            onError={() => setConnected(false)} />
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 text-gray-600 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-gray-500">Waiting for AI server…</p>
              </div>
            </div>
          )}
          {connected && (
            <div className="absolute top-2 left-2 right-2 flex justify-between pointer-events-none">
              <div className="flex items-center gap-1.5 bg-black/75 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE · YOLOv8
              </div>
              <button onClick={() => setStreamKey(k => k + 1)}
                className="pointer-events-auto flex items-center gap-1 bg-black/75 text-gray-300 text-xs px-2.5 py-1.5 rounded-lg hover:text-white cursor-pointer">
                <RefreshCw className="w-3 h-3" /> Reload
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {VEHICLE_META.map(meta => (
            <VehicleStatCard key={meta.key} meta={meta}
              total={counts?.total[meta.key] ?? 0}
              onScreen={counts?.on_screen[meta.key] ?? 0}
              grandTotal={grandTotal} />
          ))}
        </div>
      </div>

      {/* Traffic trend chart */}
      {connected && chartData.length > 2 && (
        <div className="rounded-xl bg-[#0d0f14] border border-white/10 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-white uppercase tracking-wide">Traffic flow record</p>
              <p className="text-[10px] text-gray-600 mt-0.5">Vehicles on screen over time (last {chartData.length} snapshots)</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: trendColor }}>
              <TrendIcon trend={trend} />
              <span className="font-semibold">{trendLabel}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                labelFormatter={() => ''}
                formatter={(val: number, name: string) => [val, name]}
              />
              <Line type="monotone" dataKey="vehicles"    stroke="#f36e20" strokeWidth={2} dot={false} name="Total" />
              <Line type="monotone" dataKey="Car"         stroke="#22c55e" strokeWidth={1} dot={false} name="Cars" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Rick/Bike"   stroke="#f97316" strokeWidth={1} dot={false} name="Rickshaw/Bike" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Bus"         stroke="#3b82f6" strokeWidth={1} dot={false} name="Bus/Metro" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Truck"       stroke="#a855f7" strokeWidth={1} dot={false} name="Truck" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI Suggestions */}
      {connected && suggestions.length > 0 && (
        <div className="rounded-xl bg-[#0d0f14] border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-yellow-400" />
            <p className="text-xs font-semibold text-white uppercase tracking-wide">AI Suggestions</p>
          </div>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <SuggestionRow key={i} level={s.level} text={s.text} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
