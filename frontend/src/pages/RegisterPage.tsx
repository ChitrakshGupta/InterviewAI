import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('Name, email and password are required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await register(form.name, form.email, form.password, form.companyName);
      setSentEmail(res.email || form.email);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

        {sentEmail ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📩</div>
            <h2 style={{ fontSize: '1.25rem', color: '#e8eaed', marginBottom: '0.5rem' }}>Check your email</h2>
            <p style={{ color: '#9aa0a6', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              We sent a verification link to <strong style={{ color: '#8ab4f8' }}>{sentEmail}</strong>.
              Click the link in the email to activate your account.
            </p>
            <div style={{
              background: 'rgba(138, 180, 248, 0.08)', border: '1px solid rgba(138, 180, 248, 0.2)',
              borderRadius: 10, padding: '0.875rem', fontSize: '0.8125rem', color: '#8ab4f8', marginBottom: '1.5rem',
            }}>
              ⏱ Verification link expires in 30 minutes.
            </div>
            <button className="btn btn-secondary btn-full" onClick={() => navigate('/login')}>
              Back to Sign in
            </button>
          </div>
        ) : (
          <>
            <h1 className="auth-heading">Create account</h1>
            <p className="auth-subheading">Set up your HR portal in seconds.</p>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Full name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Jane Smith"
                value={form.name}
                onChange={set('name')}
                autoComplete="name"
              />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Company (optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Acme Corp"
                value={form.companyName}
                onChange={set('companyName')}
              />
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Work email</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.com"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;
