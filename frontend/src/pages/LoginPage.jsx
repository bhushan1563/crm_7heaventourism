import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Users, Building2, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_ORIGIN } from '../services/api';
import logo from '../assets/logo.webp';
import '../login.css';

const FEATURES = [
  { icon: Users, color: '#60A5FA', title: 'Guest Inquiries', text: 'Under Process to Travelled' },
  { icon: Building2, color: '#5FD7E1', title: '5-Tier Suppliers', text: 'Domestic, Intl, Consolidators' },
  { icon: ShieldCheck, color: '#4ADE9A', title: 'Granular Rights', text: 'Download & Edit-Others rules' },
  { icon: QrCode, color: '#7DD3FC', title: 'Mobile Scanner', text: 'Instant Card / OCR parsing' }
];

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      showToast('Please enter both email and password', 'warning');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result?.success) {
      const name = result.user?.firstName;
      showToast(name ? `Welcome back, ${name}!` : 'Welcome back!', 'success');
      navigate('/dashboard');
    } else {
      showToast(result?.message || 'Login failed. Please check credentials.', 'error');
    }
  };

  return (
    <div className="login-shell">
      {/* Left: brand panel */}
      <div className="login-hero">
        <div className="login-brand">
          <div className="login-brand-logo">
            <img src={logo} alt="7Heaven Tourism" />
          </div>
          <div>
            <div className="login-brand-name">7Heaven Tourism</div>
            <div className="login-brand-tag">Travel with the Trust</div>
          </div>
        </div>

        <div className="login-hero-copy">
          <span className="login-eyebrow">Enterprise Operations Suite</span>
          <h2>Seamless Inquiries, Suppliers &amp; Security.</h2>
          <p>
            A unified operations portal built for high-end holiday management, categorized vendor directories,
            role-based download restrictions, and intelligent mobile card scanning.
          </p>

          <div className="login-features">
            {FEATURES.map(({ icon: Icon, color, title, text }) => (
              <div className="login-feature" key={title}>
                <span className="login-feature-icon" style={{ color }}>
                  <Icon size={18} />
                </span>
                <div>
                  <div className="login-feature-title">{title}</div>
                  <div className="login-feature-text">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="login-hero-footer">© 2026 7Heaven Tourism</div>
      </div>

      {/* Right: sign-in form */}
      <div className="login-form-col">
        <div className="login-card">
          <div className="login-card-head">
            <h3>Sign in to your workspace</h3>
            <p>Enter your credentials to access 7Heaven Tourism</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email address</label>
              <div className="login-field">
                <Mail size={17} className="login-field-icon" />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="form-input"
                  placeholder="name@7heaven.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '22px' }}>
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="login-field">
                <Lock size={17} className="login-field-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  className="form-input"
                  style={{ paddingRight: '42px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-field-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In to 7Heaven Tourism'}
              <ArrowRight size={16} />
            </button>

            <div className="login-divider"><span>or</span></div>

            <button
              type="button"
              className="btn btn-outline login-submit"
              onClick={() => {
                window.location.href = `${API_ORIGIN}/static/7heaven.apk`;
              }}
            >
              Download Mobile App
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
