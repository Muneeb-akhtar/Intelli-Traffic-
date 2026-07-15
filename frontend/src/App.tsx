import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import {
  Radio, Activity, Timer, TrendingUp, Shield, BarChart3, MapPin,
  Phone, FileText, ChevronRight, Download, Sun, Moon, LogOut, ChevronDown, RefreshCw
} from 'lucide-react';
import type { TrafficUpdatePayload, AnalyticsRecord, SafetyLogEntry, EngineSettings, LaneData } from './types';
import { IntersectionVisualizer } from './components/IntersectionVisualizer';
import { ControlPanel } from './components/ControlPanel';
import { AnalyticsCharts } from './components/AnalyticsCharts';
import { SafetyLogs } from './components/SafetyLogs';
import { StreamlitDashboard } from './components/StreamlitDashboard';
import { CameraFeed } from './components/CameraFeed';
import { LoginPage } from './components/LoginPage';
import { supabase } from './lib/supabase';

const LIGHT_SEQUENCE = [
  { color: '#ef4444', off: '#3b0d0d', glow: 'rgba(239,68,68,0.75)'  },  // red
  { color: '#eab308', off: '#3b2d00', glow: 'rgba(234,179,8,0.75)'  },  // yellow
  { color: '#22c55e', off: '#0a2d14', glow: 'rgba(34,197,94,0.75)'  },  // green
] as const;

const LIGHT_DURATIONS = [2800, 900, 2800]; // ms per phase: red, yellow, green

function AnimatedTrafficLight({ small = false }: { small?: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setTimeout(
      () => setPhase(p => (p + 1) % 3),
      LIGHT_DURATIONS[phase]
    );
    return () => clearTimeout(t);
  }, [phase]);

  const size   = small ? 8  : 11;
  const gap    = small ? 2  : 4;
  const px     = small ? 3  : 5;
  const py     = small ? 4  : 6;
  const radius = small ? 5  : 7;

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      gap,
      background:     '#111',
      borderRadius:   radius,
      padding:        `${py}px ${px}px`,
      border:         '1.5px solid #2a2a2a',
      boxShadow:      '0 2px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
      flexShrink:     0,
    }}>
      {LIGHT_SEQUENCE.map((l, i) => (
        <div
          key={i}
          style={{
            width:      size,
            height:     size,
            borderRadius: '50%',
            background: phase === i ? l.color : l.off,
            boxShadow:  phase === i
              ? `0 0 6px ${l.glow}, 0 0 14px ${l.glow}`
              : 'none',
            transition: 'background 0.5s ease, box-shadow 0.5s ease',
          }}
        />
      ))}
    </div>
  );
}

const PYTHON_API = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8081';

// ── Demo safety events (generated once at module load, stable across re-renders) ──
function makeDemoEvents(): SafetyLogEntry[] {
  const now = Date.now();
  const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();
  return [
    { timestamp: ago(2),   type: 'PEDESTRIAN_ALERT', message: 'Pedestrian crossing detected on Northbound approach — green phase extended by 8 s for safe crossing.' },
    { timestamp: ago(6),   type: 'SPEED_VIOLATION',  message: 'Vehicle exceeding 65 km/h detected on Eastbound via Camera 3. Event flagged for review.' },
    { timestamp: ago(11),  type: 'QUEUE_SPILLBACK',  message: 'Queue spillback on Southbound extending 40 m beyond stop line — adaptive cycle shortened by 12 s.' },
    { timestamp: ago(17),  type: 'NEAR_MISS',        message: 'Potential near-miss flagged between motorcycle and bus at Westbound entry. Clip saved for audit.' },
    { timestamp: ago(23),  type: 'CONGESTION_ALERT', message: 'Congestion index reached 0.84 across all lanes. AI rebalanced priority scoring automatically.' },
    { timestamp: ago(29),  type: 'PEDESTRIAN_ALERT', message: 'Group of pedestrians detected mid-cycle on Southbound — signal held RED on conflicting lanes.' },
    { timestamp: ago(35),  type: 'SIGNAL_FAULT',     message: 'Timing anomaly detected on Camera 2 signal head — auto-corrected by controller within 1.2 s.' },
    { timestamp: ago(41),  type: 'SPEED_VIOLATION',  message: 'Van exceeding limit on Northbound approach — second violation in 10 min window. Pattern logged.' },
    { timestamp: ago(48),  type: 'WRONG_WAY',        message: 'Possible wrong-way vehicle detected on Eastbound exit. Alert sent; no collision occurred.' },
    { timestamp: ago(54),  type: 'COUNT_SPIKE',      message: 'Vehicle count spike on Northbound (+280% in 90 s) — possibly event dispersal. Cycle extended.' },
    { timestamp: ago(62),  type: 'CAMERA_WARNING',   message: 'Camera 4 frame rate dropped to 11 FPS due to low light. Quality restored after auto-exposure adjustment.' },
    { timestamp: ago(70),  type: 'QUEUE_SPILLBACK',  message: 'Heavy queue detected on Westbound during peak hour. Wait time peaked at 94 s; AI redistributed load.' },
    { timestamp: ago(78),  type: 'NEAR_MISS',        message: 'Rickshaw and car near-miss at Northbound entry. YOLOv8 trajectory model flagged event at 91% confidence.' },
    { timestamp: ago(85),  type: 'CONGESTION_ALERT', message: 'All four approaches in high-density state simultaneously. Emergency cycle compaction triggered.' },
    { timestamp: ago(94),  type: 'PEDESTRIAN_ALERT', message: 'Late pedestrian crossing detected on Eastbound 2 s after signal change. No vehicle conflict observed.' },
    { timestamp: ago(103), type: 'SPEED_VIOLATION',  message: 'Motorcycle at estimated 80 km/h on Southbound approach. Third violation in session logged.' },
    { timestamp: ago(112), type: 'SIGNAL_FAULT',     message: 'Brief RED-phase skipped on Camera 1 due to sync drift — corrected; 3 s safety buffer enforced.' },
    { timestamp: ago(121), type: 'CAMERA_WARNING',   message: 'Camera 1 occlusion detected (possible dust/rain). Confidence dropped to 74%; operator notified.' },
    { timestamp: ago(133), type: 'COUNT_SPIKE',      message: 'Bus convoy (3 metro buses) detected on Southbound — bus weighting elevated wait priority for 60 s.' },
    { timestamp: ago(148), type: 'WRONG_WAY',        message: 'Second wrong-way detection this session on Westbound. Pattern flagged for infrastructure review.' },
    { timestamp: ago(163), type: 'CONGESTION_ALERT', message: 'Congestion index 0.91 — highest recorded this session. Incident on parallel road suspected.' },
    { timestamp: ago(179), type: 'PEDESTRIAN_ALERT', message: 'Child detected running onto Northbound road mid-phase. Emergency hold triggered for 6 s.' },
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
const DEMO_SAFETY_EVENTS = makeDemoEvents();

const CAMERA_DIRS: Record<string, string> = {
  '1': 'Northbound', '2': 'Southbound', '3': 'Eastbound', '4': 'Westbound',
};

function mapApiToPayload(sig: Record<string, any>, counts: Record<string, any>): TrafficUpdatePayload {
  const activeCam = sig.active_cam ?? 1;
  const camKey    = String(activeCam);
  const laneIndex = activeCam - 1;
  const currentLane = CAMERA_DIRS[camKey] ?? 'Northbound';
  const lightState  = (sig.signals?.[camKey] ?? 'RED') as 'GREEN' | 'YELLOW' | 'RED';
  const anyOverride = Object.values(sig.overrides ?? {}).some((v: unknown) => v != null);
  const laneData: LaneData = {};
  Object.entries(CAMERA_DIRS).forEach(([id, dir]) => {
    const c = counts?.[id] ?? {};
    laneData[dir] = {
      car:        c['Car']       ?? 0,
      motorcycle: (c['Motorcycle'] ?? 0) + (c['Rick/Bike'] ?? 0),
      truck:      c['Truck']     ?? 0,
      bus:        c['Bus']       ?? c['Bus/Metro'] ?? 0,
    };
  });
  return {
    state: {
      currentLane,
      currentLaneIndex: laneIndex,
      lightState,
      timeRemaining:  sig.time_remaining  ?? 0,
      greenDuration:  sig.phase_duration  ?? 30,
      isOverrideActive: Boolean(anyOverride),
      emergencyActive:  Boolean(sig.emergency),
      emergencyLaneIndex: null,
      cycleCount: sig.cycle_count ?? 0,
    },
    laneData,
    settings: { minGreen: 10, maxGreen: 60, densityCap: 20 },
  };
}

const ROTATING_WORDS = [
  'Controlling traffic.',
  'Detecting vehicles.',
  'Saving lives.',
  'Reducing congestion.',
  'Automating signals.',
  'Empowering cities.',
];

function RotatingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex(i => (i + 1) % ROTATING_WORDS.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="rotating-word-wrap">
      <span
        className="rotating-word text-accent"
        key={index}
      >
        {ROTATING_WORDS[index]}
      </span>
    </span>
  );
}

const STATIC_BASELINE_SECONDS = 60;

type TabKey = 'live' | 'analytics' | 'safety' | 'reports' | 'ai' | 'cameras';

const NAV_LINKS: { label: string; key: TabKey }[] = [
  { label: 'Live Control', key: 'live' },
  { label: '📹 Cameras', key: 'cameras' },
  { label: 'Analytics', key: 'analytics' },
  { label: 'Safety', key: 'safety' },
  { label: 'Reports', key: 'reports' },
  { label: '🤖 AI Dashboard', key: 'ai' },
];

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  // Bootstrap Supabase session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const name =
          session.user.user_metadata?.full_name ||
          session.user.email?.split('@')[0] ||
          'User';
        setUser(name);
      }
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const name =
          session.user.user_metadata?.full_name ||
          session.user.email?.split('@')[0] ||
          'User';
        setUser(name);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (name: string) => setUser(name);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  if (!authReady) return null;
  if (!user) return <LoginPage onLogin={handleLogin} />;

  return <Dashboard user={user} onLogout={handleLogout} isDark={isDark} onToggleDark={() => setIsDark(d => !d)} />;
}

function Dashboard({ user, onLogout, isDark, onToggleDark }: {
  user: string;
  onLogout: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  const [data, setData] = useState<TrafficUpdatePayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [safetyLogs, setSafetyLogs] = useState<SafetyLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [tickKey, setTickKey]     = useState(0);
  const [aiOnline, setAiOnline] = useState<boolean | null>(null); // null = checking
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  const [profileOpen, setProfileOpen] = useState(false);

  const fetchAiStatus = async () => {
    try {
      const res = await fetch(`${PYTHON_API}/api/status`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        setAiOnline(true);
      } else { setAiOnline(false); }
    } catch { setAiOnline(false); }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`/api/analytics`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) setAnalytics(d.map((r: any) => ({
          timestamp:          r.timestamp,
          hour:               r.hour,
          counts:             r.counts,
          totalVehicles:      r.total_vehicles,
          averageWaitSeconds: r.average_wait_seconds,
          congestionIndex:    r.congestion_index,
        })));
      }
    } catch { /* silent — Node API always available */ }
  };

  const fetchSafetyLogs = async () => {
    try {
      const res = await fetch(`/api/safety-logs`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) setSafetyLogs(d.map((r: any) => ({
          timestamp: r.timestamp,
          type:      r.type,
          message:   r.message,
        })));
      }
    } catch { /* silent */ }
  };

  const signalFails = useRef(0);

  const pollSignals = async () => {
    try {
      const [sigRes, cntRes] = await Promise.all([
        fetch(`${PYTHON_API}/api/signals`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${PYTHON_API}/api/counts`,  { signal: AbortSignal.timeout(8000) }),
      ]);
      if (sigRes.ok && cntRes.ok) {
        const [sig, counts] = await Promise.all([sigRes.json(), cntRes.json()]);
        setData(mapApiToPayload(sig, counts));
        signalFails.current = 0;
        setConnected(true);
        setTickKey(k => k + 1);
        setError(null);
      } else if (++signalFails.current >= 3) { setConnected(false); }
    } catch { if (++signalFails.current >= 3) setConnected(false); }
  };

  const refreshAll = useCallback(() => {
    fetchAiStatus();
    fetchAnalytics();
    fetchSafetyLogs();
    pollSignals();
  }, []);

  useEffect(() => {
    refreshAll();

    // Sequential signal polling — waits for each response before the next
    // request, so slow ngrok/GIL responses never stack up and flood the backend.
    let alive = true;
    const signalLoop = async () => {
      if (!alive) return;
      await pollSignals();
      if (alive) setTimeout(signalLoop, 1000);
    };
    setTimeout(signalLoop, 1000);

    const analyticsRefresh = setInterval(fetchAnalytics,  10000);
    const safetyRefresh    = setInterval(fetchSafetyLogs, 8000);
    const statusRefresh    = setInterval(fetchAiStatus,   5000);

    const onVisible = () => { if (document.visibilityState === 'visible') refreshAll(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(analyticsRefresh);
      clearInterval(safetyRefresh);
      clearInterval(statusRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Scroll + tab-switch reveal: re-runs on every tab change so newly mounted
  // .reveal elements get observed. rAF ensures the DOM is painted first.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );
    const raf = requestAnimationFrame(() => {
      document.querySelectorAll('.reveal:not(.in-view)').forEach(el => io.observe(el));
    });
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [activeTab]);

  const pyOverride = (camId: number | null, action: string) =>
    fetch(`${PYTHON_API}/api/signals/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cam_id: camId, action }),
    }).catch(() => {});

  const handleOverrideStart = async (laneIndex: number) => {
    await pyOverride(laneIndex + 1, 'FORCE_GREEN');
    fetchSafetyLogs();
  };

  const handleOverrideStop = async () => {
    // CLEAR requires a specific cam_id — broadcast to all 4 cameras
    await Promise.all([1, 2, 3, 4].map(c => pyOverride(c, 'CLEAR')));
    fetchSafetyLogs();
  };

  const handleEmergencyStart = async (laneIndex: number) => {
    await pyOverride(laneIndex + 1, 'EMERGENCY');
    fetchSafetyLogs();
  };

  const handleEmergencyStop = async () => {
    // EMERGENCY is a toggle — cam_id is irrelevant; calling it again turns it off
    await pyOverride(null, 'EMERGENCY');
    fetchSafetyLogs();
  };

  const handleUpdateSettings = async (_settings: Partial<EngineSettings>) => {
    // Signal timing is managed autonomously by the AI backend
    fetchSafetyLogs();
  };

  const mainRef = useRef<HTMLElement>(null);

  const handleViewIntersection = () => {
    setActiveTab('live');
    setTimeout(() => {
      mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleExportCSV = useCallback(() => {
    if (analytics.length === 0) {
      alert('No analytics data yet. Make sure the backend is running and wait for a few traffic cycles.');
      return;
    }

    const headers = ['Timestamp', 'Hour', 'Northbound', 'Southbound', 'Eastbound', 'Westbound', 'Total Vehicles', 'Avg Wait (s)', 'Congestion Index'];
    const rows = analytics.map(r => [
      r.timestamp,
      r.hour,
      r.counts.Northbound,
      r.counts.Southbound,
      r.counts.Eastbound,
      r.counts.Westbound,
      r.totalVehicles,
      r.averageWaitSeconds.toFixed(1),
      r.congestionIndex
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `intelli_traffic_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [analytics]);

  const getTotalVehicles = () => {
    if (!data) return 0;
    return Object.values(data.laneData).reduce(
      (sum, l) => sum + l.car + l.motorcycle + l.truck + l.bus, 0
    );
  };

  const efficiencyGain = useMemo(() => {
    if (analytics.length === 0) return null;
    const recent = analytics.slice(-7);
    const avgWait =
      recent.reduce((sum, r) => sum + r.averageWaitSeconds, 0) / recent.length;
    const gain = ((STATIC_BASELINE_SECONDS - avgWait) / STATIC_BASELINE_SECONDS) * 100;
    if (!Number.isFinite(gain)) return null;
    const sign = gain >= 0 ? '+' : '';
    return `${sign}${gain.toFixed(1)}%`;
  }, [analytics]);

  const avgWaitDisplay = useMemo(() => {
    if (analytics.length === 0) return null;
    const recent = analytics.slice(-1)[0];
    return `${recent.averageWaitSeconds.toFixed(1)}s`;
  }, [analytics]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-corporate-muted)]">
      {/* —— White corporate header (TMI) —— */}
      <header className="tmi-header sticky top-0 z-50">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-14 sm:h-[4.25rem] flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <AnimatedTrafficLight />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                  Traffic Management
                </p>
                <h1 className="font-heading text-lg font-bold text-[var(--color-corporate-text)] leading-tight truncate">
                  Intelli Traffic
                </h1>
              </div>
            </div>

            <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
              {NAV_LINKS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`nav-link px-4 py-2 rounded-full text-sm font-medium cursor-pointer ${
                    activeTab === item.key
                      ? 'nav-link-active bg-accent text-white shadow-sm'
                      : 'text-[var(--color-corporate-text-muted)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3 shrink-0">

              {/* 24/7 label */}
              <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-[var(--color-corporate-text-muted)]">
                <Shield className="w-3.5 h-3.5 text-accent" />
                24/7 Ops
              </span>

              {/* Live status */}
              <div className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
                <span className="status-dot-wrap">
                  <span key={tickKey} className="status-ring" />
                  <span className="status-dot-core" />
                </span>
                Live
              </div>

              {/* Profile dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen(o => !o)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-[var(--color-corporate-border)] hover:border-accent/50 hover:bg-[var(--color-corporate-muted)] transition-all cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                    {user.charAt(0)}
                  </span>
                  <div className="hidden sm:flex flex-col items-start leading-tight">
                    <span className="text-xs font-semibold text-[var(--color-corporate-text)]">{user}</span>
                    <span className="text-[10px] text-[var(--color-corporate-text-muted)]">Operator</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-corporate-text-muted)] transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {profileOpen && (
                  <>
                    {/* Backdrop to close on outside click */}
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-52 z-50 bg-[var(--color-corporate-bg)] border border-[var(--color-corporate-border)] rounded-xl shadow-xl overflow-hidden animate-[slideInRight_0.15s_ease_both]">
                      {/* User info header */}
                      <div className="px-4 py-3 border-b border-[var(--color-corporate-border)]">
                        <p className="text-xs font-semibold text-[var(--color-corporate-text)] truncate">{user}</p>
                        <p className="text-[10px] text-[var(--color-corporate-text-muted)] mt-0.5">Traffic Operator</p>
                      </div>

                      {/* Dark mode toggle */}
                      <button
                        type="button"
                        onClick={() => { onToggleDark(); setProfileOpen(false); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--color-corporate-text)] hover:bg-[var(--color-corporate-muted)] transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                          {isDark ? 'Light mode' : 'Dark mode'}
                        </span>
                        <span className={`w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-accent' : 'bg-[var(--color-corporate-border)]'} relative shrink-0`}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </span>
                      </button>

                      {/* Divider */}
                      <div className="mx-4 border-t border-[var(--color-corporate-border)]" />

                      {/* Sign out */}
                      <button
                        type="button"
                        onClick={() => { setProfileOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
        <div className="tmi-accent-bar" aria-hidden />
      </header>

      {/* —— Hero / tagline band —— */}
      <section className="tmi-hero relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 lg:py-10 relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-6">
            <div className="max-w-2xl">
              <p className="section-label mb-3 text-xs sm:text-sm">
                <span className="section-label-num">Ops</span>
                <span>—</span>
                <span>Command center</span>
              </p>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-[var(--color-corporate-text)] leading-tight tracking-tight drop-shadow-sm">
                Protecting lives.
                <br />
                <RotatingWord />
              </h2>
              <div className="tmi-road-pattern mt-4 sm:mt-5" aria-hidden />
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 shrink-0">
              <button type="button" className="btn-cta text-sm" onClick={handleViewIntersection}>
                <MapPin className="w-4 h-4" />
                View intersection
              </button>
              <button type="button" className="btn-cta-outline text-sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4" />
                Export report
              </button>
            </div>
          </div>
        </div>
      </section>

      <main ref={mainRef} className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6">
        {error && (
          <div className="card-light p-3 flex items-center gap-3 border-red-200 bg-red-50">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
            <p className="text-xs text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Mobile Tab Selector */}
        <div className="lg:hidden flex gap-1 overflow-x-auto pb-1">
          {NAV_LINKS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`nav-link px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTab === item.key
                  ? 'nav-link-active bg-accent text-white shadow-sm'
                  : 'bg-[var(--color-corporate-bg)] text-[var(--color-corporate-text-muted)] border border-[var(--color-corporate-border)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* ========== TAB: Live Control ========== */}
        {activeTab === 'live' && (
          <>
            {/* —— Light metrics strip —— */}
            <section aria-labelledby="metrics-heading" className="reveal">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p id="metrics-heading" className="section-label">
                  <span className="section-label-num">00</span>
                  <span>—</span>
                  <span>Live metrics</span>
                </p>
                <span className="badge badge-orange">
                  <Activity className="w-3 h-3" />
                  Real-time
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="reveal reveal-d1">
                  <MetricCardLight
                    icon={<Activity className="w-4 h-4 text-accent" />}
                    label="Active Lane"
                    value={data ? data.state.currentLane.replace('bound', '') : '—'}
                    sub={data ? `${data.state.lightState} · ${data.state.greenDuration}s phase` : 'Awaiting connection'}
                  />
                </div>
                <div className="reveal reveal-d2">
                  <MetricCardLight
                    sky
                    icon={<Radio className="w-4 h-4 text-accent" />}
                    label="Total Queue"
                    value={data ? `${getTotalVehicles()}` : '—'}
                    sub="Vehicles across all lanes"
                  />
                </div>
                <div className="reveal reveal-d3">
                  <MetricCardLight
                    accent
                    icon={<TrendingUp className="w-4 h-4 text-green-600" />}
                    label="Wait vs Static"
                    value={efficiencyGain ?? '—'}
                    sub={
                      efficiencyGain
                        ? `Avg wait ${avgWaitDisplay ?? '—'} vs ${STATIC_BASELINE_SECONDS}s static`
                        : 'Needs analytics history'
                    }
                    valueClass="text-green-700"
                  />
                </div>
                <div className="reveal reveal-d4">
                  <MetricCardLight
                    icon={<Timer className="w-4 h-4 text-[var(--color-corporate-text-muted)]" />}
                    label="Phase Timer"
                    value={data ? `${data.state.timeRemaining}s` : '—'}
                    sub={data ? `Cycle #${data.state.cycleCount}` : 'Engine offline'}
                  />
                </div>
              </div>
            </section>

            {/* —— Signal operations deck —— */}
            <section aria-labelledby="ops-heading" className="reveal">
              <div className="mb-4">
                <p id="ops-heading" className="section-label">
                  <span className="section-label-num">01</span>
                  <span>—</span>
                  <span>Live intersection</span>
                </p>
                <h3 className="font-heading text-lg font-semibold text-[var(--color-corporate-text)] mt-2">
                  Signal operations
                </h3>
              </div>

              {data ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
                  <IntersectionVisualizer state={data.state} laneData={data.laneData} />
                  <ControlPanel
                    state={data.state}
                    settings={data.settings}
                    onOverrideStart={handleOverrideStart}
                    onOverrideStop={handleOverrideStop}
                    onEmergencyStart={handleEmergencyStart}
                    onEmergencyStop={handleEmergencyStop}
                    onUpdateSettings={handleUpdateSettings}
                  />
                </div>
              ) : (
                <div className="card-light p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[200px] sm:min-h-[300px]">
                  <div className="w-10 h-10 border-[3px] border-accent border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">Connecting to backend</p>
                  <p className="text-xs text-[var(--color-corporate-text-muted)] mt-1.5 max-w-sm">
                    Ensure the Python backend is running on port 8081
                  </p>
                </div>
              )}
            </section>

            {/* —— Monitored Location Map —— */}
            <section aria-labelledby="location-heading" className="reveal">
              <div className="mb-4">
                <p id="location-heading" className="section-label">
                  <span className="section-label-num">02</span>
                  <span>—</span>
                  <span>Monitored Location</span>
                </p>
                <h3 className="font-heading text-lg font-semibold text-[var(--color-corporate-text)] mt-2">
                  Intersection overview
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
                {/* OpenStreetMap embed — no API key required */}
                <div className="lg:col-span-2 card-light overflow-hidden" style={{ minHeight: 320 }}>
                  <iframe
                    title="Monitored Intersection — Mall Road, Lahore"
                    src="https://www.openstreetmap.org/export/embed.html?bbox=74.3270%2C31.5180%2C74.3620%2C31.5470&layer=mapnik&marker=31.5325%2C74.3445"
                    className="w-full"
                    style={{ height: 320, border: 0 }}
                    loading="lazy"
                  />
                </div>

                {/* Location info panel */}
                <div className="flex flex-col gap-3">
                  <div className="card-light p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-sm font-semibold text-[var(--color-corporate-text)]">Active Site</span>
                      <span className="ml-auto badge badge-orange text-[10px]">Live</span>
                    </div>
                    <p className="text-base font-bold text-[var(--color-corporate-text)]">Mall Road</p>
                    <p className="text-sm text-[var(--color-corporate-text-muted)]">Gulberg Intersection, Lahore</p>
                    <div className="mt-3 pt-3 border-t border-[var(--color-corporate-border)] flex flex-col gap-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Coordinates</p>
                      <p className="text-xs font-mono text-[var(--color-corporate-text)]">31.5325° N, 74.3445° E</p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--color-corporate-border)] flex flex-col gap-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-corporate-text-muted)]">Zone</p>
                      <p className="text-xs text-[var(--color-corporate-text)]">Lahore, Punjab, Pakistan</p>
                    </div>
                  </div>

                  <div className="card-light p-4">
                    <p className="text-[10px] font-semibold text-[var(--color-corporate-text-muted)] uppercase tracking-wider mb-2">Camera Status</p>
                    {[1, 2, 3, 4].map(id => (
                      <div key={id} className="flex items-center gap-2 py-1.5 border-b border-[var(--color-corporate-border)] last:border-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-xs text-[var(--color-corporate-text)]">Camera {id}</span>
                        <span className="ml-auto text-[10px] text-[var(--color-corporate-text-muted)]">
                          {connected ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ========== TAB: Analytics ========== */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-5 reveal">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="section-label">
                  <span className="section-label-num">02</span>
                  <span>—</span>
                  <span>Performance</span>
                </p>
                <h2 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] mt-2">
                  Traffic analytics
                </h2>
                <p className="text-sm text-[var(--color-corporate-text-muted)] mt-1">
                  Live data from the AI module — snapshots recorded every 30 s
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button type="button" onClick={() => { fetchAnalytics(); fetchSafetyLogs(); }}
                  className="btn-cta-outline text-xs py-1.5 px-3">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
                <button type="button" onClick={handleExportCSV} disabled={analytics.length === 0}
                  className="btn-cta-outline text-xs py-1.5 px-3">
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Live summary strip from latest record */}
            {analytics.length > 0 && (() => {
              const latest = analytics[analytics.length - 1];
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCardLight icon={<BarChart3 className="w-4 h-4 text-accent" />}
                    label="Total Vehicles" value={String(latest.totalVehicles)}
                    sub={`Last snapshot · ${latest.hour}`} />
                  <MetricCardLight sky icon={<TrendingUp className="w-4 h-4 text-accent" />}
                    label="Avg Wait Time" value={`${latest.averageWaitSeconds}s`}
                    sub={`vs ${STATIC_BASELINE_SECONDS}s static`} />
                  <MetricCardLight accent icon={<Activity className="w-4 h-4 text-green-600" />}
                    label="Efficiency" value={`${Math.max(0, Math.round(((STATIC_BASELINE_SECONDS - latest.averageWaitSeconds) / STATIC_BASELINE_SECONDS) * 100))}%`}
                    sub="Wait reduction vs fixed timing" valueClass="text-green-700" />
                  <MetricCardLight icon={<Shield className="w-4 h-4 text-[var(--color-corporate-text-muted)]" />}
                    label="Congestion Index" value={String(latest.congestionIndex)}
                    sub={`${analytics.length} records collected`} />
                </div>
              );
            })()}

            {/* Detection status banner — only shown when no stored data exists */}
            {aiOnline === false && analytics.length === 0 && (
              <div className="card-light p-4 border-l-4 border-l-amber-400 flex items-start gap-3">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0 mt-1" />
                <div>
                  <p className="text-sm font-semibold text-amber-700">No analytics recorded yet</p>
                  <p className="text-xs text-[var(--color-corporate-text-muted)] mt-0.5">
                    Start the Python backend to begin recording traffic analytics. Data is stored permanently in the cloud.
                  </p>
                  <code className="mt-1.5 block text-xs bg-[var(--color-corporate-muted)] border border-[var(--color-corporate-border)] rounded-lg px-3 py-2 font-mono text-[var(--color-corporate-text)]">
                    .venv\Scripts\python.exe ai_module\vehicle_counter.py
                  </code>
                </div>
              </div>
            )}
            {aiOnline === false && analytics.length > 0 && (
              <div className="card-light p-4 border-l-4 border-l-blue-400 flex items-center gap-3">
                <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                <p className="text-sm text-[var(--color-corporate-text-muted)]">
                  Showing stored analytics — live detection offline. Start Python backend to record new data.
                </p>
              </div>
            )}
            {aiOnline === true && analytics.length === 0 && (
              <div className="card-light p-4 border-l-4 border-l-green-400 flex items-center gap-3">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
                <p className="text-sm font-semibold text-green-700">AI backend connected — first snapshot in ~10 seconds</p>
              </div>
            )}

            {/* Charts */}
            <div className="card-light p-5 sm:p-6">
              {analytics.length > 0 ? (
                <AnalyticsCharts data={analytics} />
              ) : (
                <div className="py-16 text-center">
                  <BarChart3 className="w-10 h-10 text-[var(--color-corporate-border)] mx-auto mb-3" />
                  <p className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">
                    No data yet
                  </p>
                  <p className="text-xs text-[var(--color-corporate-text-muted)] mt-1 max-w-xs mx-auto">
                    Start the Python backend to begin recording. Data will persist here permanently.
                  </p>
                </div>
              )}
            </div>

            {/* Per-camera breakdown table */}
            {analytics.length > 0 && (
              <div className="card-light p-5">
                <h3 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)] mb-3">
                  Per-lane vehicle counts — latest snapshot
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(['Northbound', 'Southbound', 'Eastbound', 'Westbound'] as const).map(dir => {
                    const latest = analytics[analytics.length - 1];
                    const count  = latest.counts[dir] ?? 0;
                    return (
                      <div key={dir} className="bg-[var(--color-corporate-muted)] border border-[var(--color-corporate-border)] rounded-lg px-4 py-3 text-center">
                        <p className="text-xs text-[var(--color-corporate-text-muted)] font-medium mb-1">{dir.replace('bound', '')}</p>
                        <p className="font-heading text-2xl font-bold tabular-nums text-[var(--color-corporate-text)]">{count}</p>
                        <p className="text-[10px] text-[var(--color-corporate-text-muted)] mt-0.5">vehicles counted</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== TAB: Safety ========== */}
        {activeTab === 'safety' && (
          <div className="flex flex-col gap-5 reveal">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="section-label">
                  <span className="section-label-num">03</span>
                  <span>—</span>
                  <span>Safety</span>
                </p>
                <h2 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] mt-2">
                  Safety audit log
                </h2>
                <p className="text-sm text-[var(--color-corporate-text-muted)] mt-1">
                  Override events, emergency activations, and configuration changes — synced with AI Dashboard controls
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="badge badge-neutral text-[10px]">
                  {safetyLogs.length} events
                </span>
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  aiOnline === false
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : aiOnline === true
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-[var(--color-corporate-muted)] text-[var(--color-corporate-text-muted)] border-[var(--color-corporate-border)]'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${aiOnline ? 'bg-green-500' : aiOnline === false ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
                  {aiOnline === null ? 'Checking…' : aiOnline ? 'Live' : 'Backend offline'}
                </div>
                <button type="button" onClick={fetchSafetyLogs}
                  className="btn-cta-outline text-xs py-1.5 px-3">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Quick stats — always visible (includes demo events) */}
            {(() => {
              const allLogs = [...safetyLogs, ...DEMO_SAFETY_EVENTS];
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Overrides',    types: ['OVERRIDE_START'],                           color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
                    { label: 'Emergencies',  types: ['EMERGENCY_START', 'NEAR_MISS', 'WRONG_WAY'], color: 'text-red-700',   bg: 'bg-red-50 border-red-200'     },
                    { label: 'Speed Alerts', types: ['SPEED_VIOLATION', 'COUNT_SPIKE'],            color: 'text-orange-700',bg: 'bg-orange-50 border-orange-200'},
                    { label: 'System',       types: ['SIGNAL_FAULT', 'CAMERA_WARNING', 'CONGESTION_ALERT', 'QUEUE_SPILLBACK', 'PEDESTRIAN_ALERT'], color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
                  ].map(({ label, types, color, bg }) => (
                    <div key={label} className={`rounded-xl border px-4 py-3 text-center ${bg}`}>
                      <p className={`font-heading text-2xl font-bold tabular-nums ${color}`}>
                        {allLogs.filter(l => types.includes(l.type)).length}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${color}`}>{label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            <SafetyLogs logs={
              [...safetyLogs, ...DEMO_SAFETY_EVENTS]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            } />
          </div>
        )}

        {/* ========== TAB: Reports ========== */}
        {activeTab === 'reports' && (
          <section className="card-light p-5 sm:p-6 reveal">
            <div className="mb-5">
              <p className="section-label">
                <span className="section-label-num">04</span>
                <span>—</span>
                <span>Reports</span>
              </p>
              <h2 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] mt-2">
                Data export center
              </h2>
              <p className="text-sm text-[var(--color-corporate-text-muted)] mt-1">
                Download AI-generated traffic data for external analysis and reporting
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card-light p-5 flex flex-col gap-3 border-l-4 border-l-accent">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  <h3 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">
                    Analytics CSV
                  </h3>
                </div>
                <p className="text-xs text-[var(--color-corporate-text-muted)] leading-relaxed">
                  Time-series traffic volume from the AI module — per-camera counts, average signal wait times, and congestion index. Recorded every 30 seconds while the AI backend is running.
                </p>
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-[var(--color-corporate-text-muted)] tabular-nums">
                    {analytics.length} snapshots available
                  </span>
                  <button type="button" onClick={handleExportCSV} disabled={analytics.length === 0}
                    className="btn-cta text-xs py-1.5 px-4">
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              </div>

              <div className="card-light p-5 flex flex-col gap-3 border-l-4 border-l-red-400">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  <h3 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">
                    Safety Audit Log
                  </h3>
                </div>
                <p className="text-xs text-[var(--color-corporate-text-muted)] leading-relaxed">
                  Audit trail of all manual overrides and emergency activations applied from any tab — Camera Feed, AI Dashboard, or Live Control.
                </p>
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-[var(--color-corporate-text-muted)] tabular-nums">
                    {safetyLogs.length} events logged
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('safety')}
                    className="btn-cta-outline text-xs py-1.5 px-4"
                  >
                    View logs
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Data freshness card */}
              <div className="sm:col-span-2 card-light p-4 flex items-start gap-3 border border-[var(--color-corporate-border)]">
                <Activity className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-[var(--color-corporate-text)]">
                    Data source: AI module (Python backend)
                  </p>
                  <p className="text-xs text-[var(--color-corporate-text-muted)] mt-0.5 leading-relaxed">
                    Analytics snapshots are captured every 30 s by the Python backend. Safety events are logged in real time whenever an override is applied from any tab. All data is held in memory — restart the backend to reset.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========== TAB: Cameras ========== */}
        {activeTab === 'cameras' && (
          <div className="reveal"><CameraFeed /></div>
        )}

        {/* ========== TAB: AI Dashboard — always mounted, hidden when inactive ========== */}
        <div className={activeTab === 'ai' ? 'reveal' : 'hidden'}>
          <StreamlitDashboard />
        </div>
      </main>

      <footer className="tmi-footer py-8 mt-auto reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AnimatedTrafficLight small />
                <span className="font-heading font-bold text-[var(--color-corporate-text)]">Intelli Traffic</span>
              </div>
              <p className="text-sm text-[var(--color-corporate-text-muted)] max-w-xs">
                Protecting lives. Controlling traffic. Final Year Project operations console.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <FooterLink label="Live Control" onClick={() => setActiveTab('live')} />
              <FooterLink label="Analytics" onClick={() => setActiveTab('analytics')} />
              <FooterLink label="Safety docs" onClick={() => setActiveTab('safety')} />
              <FooterLink label="Contact ops" icon={<Phone className="w-3.5 h-3.5" />} />
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[var(--color-corporate-border)] flex flex-col sm:flex-row sm:justify-between gap-1 text-xs text-[var(--color-corporate-text-muted)]">
            <span>© {new Date().getFullYear()} Intelli Traffic</span>
            <span className="tabular-nums">Intelli Traffic · YOLOv8 · Flask · Supabase</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterLink({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick?: () => void }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick?.(); }} className="inline-flex items-center gap-1.5">
      {icon}
      {label}
      <ChevronRight className="w-3 h-3 opacity-50" />
    </a>
  );
}

function MetricCardLight({
  label,
  value,
  sub,
  accent,
  sky,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  sky?: boolean;
  icon?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div
      className={`metric-card-light px-4 py-4 ${accent ? 'metric-card-light-accent' : ''} ${sky ? 'metric-card-light-sky' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-[var(--color-corporate-text-muted)] font-semibold uppercase tracking-wide">
          {label}
        </p>
        {icon}
      </div>
      <p
        className={`font-heading text-2xl sm:text-3xl font-bold leading-tight tabular-nums text-[var(--color-corporate-text)] ${valueClass ?? ''}`}
      >
        {value}
      </p>
      <p className="text-xs text-[var(--color-corporate-text-muted)] mt-1.5 leading-snug">{sub}</p>
    </div>
  );
}

export default App;
