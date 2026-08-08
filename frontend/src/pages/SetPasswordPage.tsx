import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const SetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuthSession } = useAuth();
  const { theme, toggle } = useTheme();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tempToken = sessionStorage.getItem('hireai_temp_token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tempToken) {
      setError('Session expired. Please log in again.');
      setTimeout(() => navigate('/login'), 2000);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.setPassword(tempToken, newPassword);
      sessionStorage.removeItem('hireai_temp_token');
      setAuthSession(data.data.token, data.data.hr);
      navigate(data.data.hr.profileComplete ? '/dashboard' : '/profile');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!tempToken) {
    return (
      <div className="auth-page">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.125rem', color: '#e8eaed', marginBottom: '0.5rem' }}>Session Expired</h2>
          <p style={{ color: '#9aa0a6', fontSize: '0.875rem' }}>Please log in again to continue.</p>
          <button className="btn btn-primary btn-full" style={{ marginTop: '1.25rem' }} onClick={() => navigate('/login')}>
            Back to Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div className="auth-brand">
            <div className="auth-brand-mark">H</div>
            <span className="auth-brand-name">HireAI</span>
          </div>
          <button className="theme-toggle" onClick={toggle}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', marginBottom: '1rem',
          }}>🔐</div>
          <h1 className="auth-heading" style={{ marginBottom: '0.25rem' }}>Set your password</h1>
          <p className="auth-subheading">You've been invited! Choose a secure password to activate your account.</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Min. 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <div className="form-field">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div style={{
            background: 'rgba(99, 102, 241, 0.07)',
            border: '1px solid rgba(99, 102, 241, 0.18)',
            borderRadius: 10, padding: '0.75rem 1rem',
            fontSize: '0.8125rem', color: '#8ab4f8', marginBottom: '1.25rem',
          }}>
            🔒 Your password must be at least 8 characters long.
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Saving…' : 'Set Password & Continue →'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPasswordPage;
