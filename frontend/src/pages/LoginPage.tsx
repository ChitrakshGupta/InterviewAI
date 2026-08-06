import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authApi } from '../api';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendStatus, setResendStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowResend(false);
    setResendStatus('');
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; requiresVerification?: boolean } } })?.response?.data;
      if (data?.requiresVerification) {
        setShowResend(true);
      }
      setError(data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div className="auth-brand">
            <div className="auth-brand-mark">H</div>
            <span className="auth-brand-name">HireAI</span>
          </div>
          <button className="theme-toggle" onClick={toggle}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>

        <h1 className="auth-heading">Sign in</h1>
        <p className="auth-subheading">Welcome back to your HR portal.</p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div><span>⚠</span> {error}</div>
            {showResend && (
              <div>
                <button
                  type="button"
                  style={{
                    background: 'none', border: 'none', color: '#8ab4f8', textDecoration: 'underline',
                    cursor: 'pointer', fontSize: '0.8125rem', padding: 0, fontFamily: 'inherit',
                  }}
                  onClick={async () => {
                    try {
                      const { data } = await authApi.resendVerification(email);
                      setResendStatus(data.message || 'Verification link sent!');
                    } catch (err: any) {
                      setResendStatus(err?.response?.data?.message || 'Failed to resend.');
                    }
                  }}
                >
                  Resend verification link
                </button>
                {resendStatus && <div style={{ color: '#e8eaed', fontSize: '0.75rem', marginTop: '0.25rem' }}>{resendStatus}</div>}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer-text">
          Don't have an account?{' '}
          <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
