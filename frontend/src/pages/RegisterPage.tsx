import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSignUp } from '@clerk/clerk-react';
import { useTheme } from '../context/ThemeContext';

type Step = 'form' | 'verify';

const RegisterPage: React.FC = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // ── Step 1: Create the account ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
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
      const parts = form.name.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || undefined;

      await signUp!.create({
        emailAddress: form.email,
        password: form.password,
        firstName,
        lastName,
        // Store companyName in Clerk's unsafeMetadata — synced to DB via webhook
        unsafeMetadata: { companyName: form.companyName },
      });

      // Ask Clerk to send an email verification code
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('verify');
    } catch (err: unknown) {
      const clerkErrors = (err as { errors?: { message: string }[] })?.errors;
      const msg = clerkErrors?.[0]?.message ?? 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify the email with the code sent by Clerk ───────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    if (!code.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp!.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        navigate('/dashboard');
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (err: unknown) {
      const clerkErrors = (err as { errors?: { message: string }[] })?.errors;
      const msg = clerkErrors?.[0]?.message ?? 'Verification failed. Please check the code.';
      setError(msg);
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

        {/* ── STEP 2: Email verification code ── */}
        {step === 'verify' ? (
          <>
            <div style={{ textAlign: 'center', padding: '0.5rem 0 1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📩</div>
              <h2 style={{ fontSize: '1.25rem', color: '#e8eaed', marginBottom: '0.5rem' }}>Check your email</h2>
              <p style={{ color: '#9aa0a6', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
                We sent a 6-digit code to{' '}
                <strong style={{ color: '#8ab4f8' }}>{form.email}</strong>.
              </p>
              <p style={{ color: '#9aa0a6', fontSize: '0.8125rem' }}>Enter it below to activate your account.</p>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleVerify} noValidate>
              <div className="form-field">
                <label className="form-label">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  maxLength={6}
                  style={{ letterSpacing: '0.35em', fontSize: '1.25rem', textAlign: 'center' }}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading || !isLoaded}>
                {loading && <span className="btn-spinner" />}
                {loading ? 'Verifying…' : 'Verify email'}
              </button>
            </form>

            <p className="auth-footer-text" style={{ marginTop: '1rem' }}>
              Wrong email?{' '}
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#8ab4f8', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline', fontFamily: 'inherit' }}
                onClick={() => { setStep('form'); setError(''); }}
              >
                Go back
              </button>
            </p>
          </>
        ) : (
          /* ── STEP 1: Registration form ── */
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

              {/* Clerk Bot Protection / Turnstile Container */}
              <div id="clerk-captcha" style={{ margin: '0.5rem 0' }}></div>

              <button type="submit" className="btn btn-primary btn-full" disabled={loading || !isLoaded}>
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
