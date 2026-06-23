import { useState, useEffect } from 'react';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const LIGHT_SEQUENCE = [
  { color: '#ef4444', off: '#3b0d0d', glow: 'rgba(239,68,68,0.75)' },
  { color: '#eab308', off: '#3b2d00', glow: 'rgba(234,179,8,0.75)' },
  { color: '#22c55e', off: '#0a2d14', glow: 'rgba(34,197,94,0.75)' },
] as const;
const DURATIONS = [2800, 900, 2800];

function AnimatedLight() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPhase(p => (p + 1) % 3), DURATIONS[phase]);
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 5, background: '#111', borderRadius: 10,
      padding: '8px 6px', border: '1.5px solid #2a2a2a',
      boxShadow: '0 2px 16px rgba(0,0,0,0.7)', flexShrink: 0,
    }}>
      {LIGHT_SEQUENCE.map((l, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: '50%',
          background: phase === i ? l.color : l.off,
          boxShadow: phase === i ? `0 0 8px ${l.glow}, 0 0 18px ${l.glow}` : 'none',
          transition: 'background 0.5s ease, box-shadow 0.5s ease',
        }} />
      ))}
    </div>
  );
}

interface Props {
  onLogin: (name: string) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [mode, setMode]           = useState<'login' | 'signup'>('login');
  const [showPass, setShowPass]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [form, setForm]           = useState({ name: '', email: '', password: '', confirm: '' });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // --- Client-side validation ---
    if (mode === 'signup') {
      if (!form.name.trim())              return setError('Please enter your full name.');
      if (!form.email.includes('@'))      return setError('Please enter a valid email.');
      if (form.password.length < 6)      return setError('Password must be at least 6 characters.');
      if (form.password !== form.confirm) return setError('Passwords do not match.');
    } else {
      if (!form.email.includes('@'))      return setError('Please enter a valid email.');
      if (!form.password)                 return setError('Please enter your password.');
    }

    setLoading(true);

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.name.trim() },
        },
      });

      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // If email confirmation is disabled, user is logged in immediately
      if (data.session) {
        onLogin(form.name.trim() || form.email.split('@')[0]);
        return;
      }

      // Email confirmation required
      setSuccess('Account created! Check your email to confirm before signing in.');
      setMode('login');
      setForm(f => ({ ...f, password: '', confirm: '' }));

    } else {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      setLoading(false);

      if (signInError) {
        if (signInError.message.toLowerCase().includes('invalid')) {
          setError('Incorrect email or password.');
        } else if (signInError.message.toLowerCase().includes('confirm')) {
          setError('Please confirm your email address first.');
        } else {
          setError(signInError.message);
        }
        return;
      }

      const name =
        data.user?.user_metadata?.full_name ||
        data.user?.email?.split('@')[0] ||
        'User';
      onLogin(name);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'signup' : 'login');
    setError('');
    setSuccess('');
    setForm({ name: '', email: '', password: '', confirm: '' });
  };

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-overlay" />

      <div className="login-card">
        {/* Branding */}
        <div className="flex items-center gap-3 mb-7">
          <AnimatedLight />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              Traffic Management
            </p>
            <h1 className="font-heading text-xl font-bold text-[var(--color-corporate-text)] leading-tight">
              Intelli Traffic
            </h1>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-5">
          <h2 className="font-heading text-2xl font-bold text-[var(--color-corporate-text)]">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-sm text-[var(--color-corporate-text-muted)] mt-1">
            {mode === 'login'
              ? 'Sign in to access the command center'
              : 'Register to manage traffic operations'}
          </p>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          <button type="button"
            className={`login-tab ${mode === 'login' ? 'login-tab-active' : ''}`}
            onClick={() => mode !== 'login' && switchMode()}>
            Sign In
          </button>
          <button type="button"
            className={`login-tab ${mode === 'signup' ? 'login-tab-active' : ''}`}
            onClick={() => mode !== 'signup' && switchMode()}>
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-5">

          {mode === 'signup' && (
            <div className="login-field">
              <label className="login-label">Full name</label>
              <div className="login-input-wrap">
                <User className="login-icon" />
                <input type="text" placeholder="John Smith" value={form.name}
                  onChange={set('name')} className="login-input" autoComplete="name" />
              </div>
            </div>
          )}

          <div className="login-field">
            <label className="login-label">Email address</label>
            <div className="login-input-wrap">
              <Mail className="login-icon" />
              <input type="email" placeholder="you@example.com" value={form.email}
                onChange={set('email')} className="login-input" autoComplete="email" />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <div className="login-input-wrap">
              <Lock className="login-icon" />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                className="login-input"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="login-eye" onClick={() => setShowPass(v => !v)}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="login-field">
              <label className="login-label">Confirm password</label>
              <div className="login-input-wrap">
                <Lock className="login-icon" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.confirm}
                  onChange={set('confirm')}
                  className="login-input"
                  autoComplete="new-password"
                />
                <button type="button" className="login-eye" onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="flex justify-end -mt-1">
              <button type="button" className="text-xs text-accent hover:underline">
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}

          <button type="submit" disabled={loading} className="login-submit">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <>{mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight className="w-4 h-4" /></>
            }
          </button>
        </form>

        <p className="text-center text-sm text-[var(--color-corporate-text-muted)] mt-5">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button type="button" onClick={switchMode} className="text-accent font-semibold hover:underline">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
