import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import {
  Radio, Activity, Timer, TrendingUp, Shield, BarChart3, MapPin,
  Phone, FileText, ChevronRight, Download, Sun, Moon, LogOut, ChevronDown
} from 'lucide-react';
import type { TrafficUpdatePayload, AnalyticsRecord, SafetyLogEntry, EngineSettings } from './types';
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

const API_BASE = 'http://localhost:5000/api';
const WS_URL = 'ws://localhost:5000';

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
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  const [profileOpen, setProfileOpen] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/analytics`);
      const json = await res.json();
      if (json.success) setAnalytics(json.data);
    } catch { /* silent */ }
  };

  const fetchSafetyLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/safety-logs`);
      const json = await res.json();
      if (json.success) setSafetyLogs(json.data);
    } catch { /* silent */ }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const json = await res.json();
      if (json.success) { setData(json.data); setError(null); }
    } catch {
      setError('Cannot reach backend server.');
    }
  };

  const connectWs = () => {
    if (ws.current) ws.current.close();
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => { setConnected(true); setError(null); fetchAnalytics(); fetchSafetyLogs(); };
    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'STATE_UPDATE') setData(msg.data);
      } catch { /* ignore */ }
    };
    socket.onclose = () => { setConnected(false); fetchStatus(); setTimeout(connectWs, 3000); };
    socket.onerror = () => socket.close();
  };

  useEffect(() => {
    connectWs();
    fetchAnalytics();
    fetchSafetyLogs();
    const poll = setInterval(() => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) fetchStatus();
    }, 2000);
    const analyticsRefresh = setInterval(fetchAnalytics, 30000);
    const safetyRefresh = setInterval(fetchSafetyLogs, 10000);
    return () => { clearInterval(poll); clearInterval(analyticsRefresh); clearInterval(safetyRefresh); ws.current?.close(); };
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

  const handleOverrideStart = async (laneIndex: number) => {
    await fetch(`${API_BASE}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', laneIndex })
    });
    fetchSafetyLogs();
  };

  const handleOverrideStop = async () => {
    await fetch(`${API_BASE}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
    fetchSafetyLogs();
  };

  const handleEmergencyStart = async (laneIndex: number) => {
    await fetch(`${API_BASE}/emergency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', laneIndex })
    });
    fetchSafetyLogs();
  };

  const handleEmergencyStop = async () => {
    await fetch(`${API_BASE}/emergency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
    fetchSafetyLogs();
  };

  const handleUpdateSettings = async (settings: Partial<EngineSettings>) => {
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
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
          <div className="h-[4.25rem] flex items-center justify-between gap-4">
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
                  <span className="status-ring" />
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
                    <div className="absolute right-0 top-full mt-2 w-52 z-50 bg-[var(--color-corporate-bg)] border border-[var(--color-corporate-border)] rounded-xl shadow-xl overflow-hidden animate-[slideInDown_0.15s_ease_both]">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-2xl">
              <p className="section-label mb-4 text-sm">
                <span className="section-label-num">Ops</span>
                <span>—</span>
                <span>Command center</span>
              </p>
              <h2 className="font-heading text-5xl sm:text-6xl font-bold text-[var(--color-corporate-text)] leading-tight tracking-tight drop-shadow-sm">
                Protecting lives.
                <br />
                <RotatingWord />
              </h2>
              <div className="tmi-road-pattern mt-5" aria-hidden />
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <button type="button" className="btn-cta" onClick={handleViewIntersection}>
                <MapPin className="w-4 h-4" />
                View intersection
              </button>
              <button type="button" className="btn-cta-outline" onClick={handleExportCSV}>
                <Download className="w-4 h-4" />
                Export report
              </button>
            </div>
          </div>
        </div>
      </section>

      <main ref={mainRef} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

            {/* —— Dark ops deck (viz) —— */}
            <section aria-labelledby="ops-heading" className="reveal">
              <div className="mb-4">
                <p id="ops-heading" className="section-label text-accent">
                  <span className="section-label-num text-text-tertiary">01</span>
                  <span>—</span>
                  <span className="text-text-secondary">Live intersection</span>
                </p>
                <h3 className="font-heading text-lg font-semibold text-[var(--color-corporate-text)] mt-2">
                  Signal operations deck
                </h3>
              </div>

              {data ? (
                <div className="ops-deck">
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
                </div>
              ) : (
                <div className="ops-deck">
                  <div className="card p-12 sm:p-16 text-center flex flex-col items-center justify-center min-h-[360px]">
                    <div className="w-10 h-10 border-[3px] border-accent border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="font-heading text-sm font-semibold text-text-primary">Connecting to backend</p>
                    <p className="text-xs text-text-tertiary mt-1.5 max-w-sm">
                      Ensure the Express server is running on port 5000
                    </p>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* ========== TAB: Analytics ========== */}
        {activeTab === 'analytics' && (
          <section className="card-light p-5 sm:p-6 reveal">
            <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
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
                  Historical patterns and adaptive cycle performance
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button type="button" onClick={handleExportCSV} disabled={analytics.length === 0} className="btn-cta-outline text-xs py-1.5 px-3">
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <span className="badge badge-orange">
                  <BarChart3 className="w-3 h-3" />
                  Last 14 intervals
                </span>
              </div>
            </div>
            {analytics.length > 0 ? (
              <AnalyticsCharts data={analytics} />
            ) : (
              <div className="py-12 text-center">
                <BarChart3 className="w-10 h-10 text-[var(--color-corporate-border)] mx-auto mb-3" />
                <p className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">No analytics data yet</p>
                <p className="text-xs text-[var(--color-corporate-text-muted)] mt-1">Analytics will populate once the engine is running.</p>
              </div>
            )}
          </section>
        )}

        {/* ========== TAB: Safety ========== */}
        {activeTab === 'safety' && (
          <section className="reveal">
            <div className="mb-5">
              <p className="section-label">
                <span className="section-label-num">03</span>
                <span>—</span>
                <span>Safety</span>
              </p>
              <h2 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] mt-2">
                Safety audit log
              </h2>
              <p className="text-sm text-[var(--color-corporate-text-muted)] mt-1">
                Override events, emergency activations, and configuration changes
              </p>
            </div>
            <SafetyLogs logs={safetyLogs} />
          </section>
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
                Download traffic data for external analysis and reporting
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card-light p-5 flex flex-col gap-3 border-l-4 border-l-accent">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  <h3 className="font-heading text-sm font-semibold text-[var(--color-corporate-text)]">
                    Historical Analytics CSV
                  </h3>
                </div>
                <p className="text-xs text-[var(--color-corporate-text-muted)] leading-relaxed">
                  Full hourly traffic volume report including lane-by-lane counts, average wait times, and congestion index values.
                </p>
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-[var(--color-corporate-text-muted)] tabular-nums">
                    {analytics.length} records available
                  </span>
                  <button type="button" onClick={handleExportCSV} disabled={analytics.length === 0} className="btn-cta text-xs py-1.5 px-4">
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
                  Complete audit trail of manual overrides, emergency vehicle activations, and engine parameter changes.
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
            </div>
          </section>
        )}

        {/* ========== TAB: Cameras ========== */}
        {activeTab === 'cameras' && (
          <div className="reveal"><CameraFeed /></div>
        )}

        {/* ========== TAB: AI Dashboard ========== */}
        {activeTab === 'ai' && (
          <div className="reveal"><StreamlitDashboard /></div>
        )}
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
            <span className="tabular-nums">API localhost:5000 · UI localhost:3000</span>
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
