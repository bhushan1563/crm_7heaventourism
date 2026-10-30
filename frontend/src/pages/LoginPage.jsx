import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Sparkles, Users, Building2, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import logo from '../assets/logo.webp';

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
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        background: '#0F172A',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background ambient lighting */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'rgba(37, 99, 235, 0.15)',
          filter: 'blur(120px)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'rgba(38, 198, 218, 0.12)',
          filter: 'blur(120px)',
          pointerEvents: 'none'
        }}
      />

      {/* Left Column: Brand Hero & Value Proposition */}
      <div
        style={{
          flex: '1.1',
          padding: '60px 70px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
          zIndex: 1
        }}
      >
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)',
              overflow: 'hidden'
            }}
          >
            <img src={logo} alt="7Heaven Tourism" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-headline)', fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              7Heaven Tourism
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
              Travel with the Trust
            </div>
          </div>
        </div>

        {/* Hero Copy */}
        <div style={{ maxWidth: '540px', margin: '40px 0' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#93C5FD',
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: '20px'
            }}
          >
            <Sparkles size={14} color="#26C6DA" /> Enterprise Operations Suite
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-headline)',
              fontSize: '2.75rem',
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#FFFFFF',
              letterSpacing: '-0.03em',
              marginBottom: '20px'
            }}
          >
            Seamless Inquiries, Suppliers & Security.
          </h2>

          <p style={{ fontSize: '1.05rem', color: '#94A3B8', lineHeight: 1.6, marginBottom: '32px' }}>
            A unified operations portal built for high-end luxury holiday management, categorized vendor directories, role-based download restrictions, and intelligent mobile card scanning.
          </p>

          {/* Feature Grid Pills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Users size={20} color="#2563EB" />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC' }}>Guest Inquiries</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Under Process to Travelled</div>
              </div>
            </div>

            <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Building2 size={20} color="#26C6DA" />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC' }}>5-Tier Suppliers</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Domestic, Intl, Consolidators</div>
              </div>
            </div>

            <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldCheck size={20} color="#10B981" />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC' }}>Granular Rights</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Download & Edit-Others rules</div>
              </div>
            </div>

            <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <QrCode size={20} color="#0288D1" />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC' }}>Mobile Scanner</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Instant Card / OCR parsing</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
          © 2026 7Heaven Tourism • High Availability Cluster
        </div>
      </div>

      {/* Right Column: Portal Login Form */}
      <div
        style={{
          flex: '0.9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          zIndex: 1,
          background: '#0B132B'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '40px',
            borderRadius: '20px',
            background: '#FFFFFF',
            boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.3)'
          }}
        >
          <div style={{ marginBottom: '28px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'var(--font-headline)' }}>
              Portal Sign In
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px' }}>
              Enter your credentials to access 7Heaven Tourism
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  style={{ paddingLeft: '40px' }}
                  placeholder="name@7heaven.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Mail
                  size={18}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              {/* <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>
                  Forgot password?
                </span>
              </div> */}
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: '40px', paddingRight: '40px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock
                  size={18}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '13px', fontSize: '0.95rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In to 7Heaven Tourism'}
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', padding: '13px', fontSize: '0.95rem', marginTop: '10px' }}
              onClick={() => {
                window.location.href = `${process.env?.REACT_APP_APIURL.replace(/\/+$/, '')}/static/7heaven.apk`;
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
