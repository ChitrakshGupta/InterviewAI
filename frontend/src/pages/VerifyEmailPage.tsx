import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { setAuthSession } = useAuth();
  const { theme, toggle } = useTheme();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No verification token provided in the link.');
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const { data } = await authApi.verifyEmail(token);
        if (isSubscribed) {
          const { token: jwtToken, hr } = data.data;
          setAuthSession(jwtToken, hr);
          setStatus('success');
          setTimeout(() => {
            navigate(hr.profileComplete ? '/dashboard' : '/profile');
          }, 2000);
        }
      } catch (err: unknown) {
        if (isSubscribed) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setStatus('error');
          setErrorMsg(msg || 'Verification failed or link has expired.');
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [token, setAuthSession, navigate]);

  const handleResend = async () => {
    if (!resendEmail) return;
    setResending(true);
    setResendMsg('');
    try {
      const { data } = await authApi.resendVerification(resendEmail);
      setResendMsg(data.message || 'A new verification link has been sent to your email.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResendMsg(msg || 'Failed to resend verification link.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div className="auth-brand">
            <div className="auth-brand-mark">H</div>
            <span className="auth-brand-name">HireAI</span>
          </div>
          <button className="theme-toggle" onClick={toggle}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>

        {status === 'verifying' && (
          <div style={{ padding: '2rem 0' }}>
            <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 1.25rem', borderWidth: 3 }} />
            <h2 style={{ fontSize: '1.25rem', color: '#e8eaed', marginBottom: '0.5rem' }}>Verifying your email…</h2>
            <p style={{ color: '#9aa0a6', fontSize: '0.875rem' }}>Checking your secure Redis verification token.</p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ padding: '1rem 0' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.25rem',
              boxShadow: '0 0 30px rgba(16,185,129,0.3)',
            }}>✓</div>
            <h2 style={{ fontSize: '1.375rem', color: '#e8eaed', fontWeight: 700, marginBottom: '0.5rem' }}>Email Verified!</h2>
            <p style={{ color: '#9aa0a6', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Your email address has been confirmed. Redirecting to your dashboard…
            </p>
          </div>
        )}

        {status === 'error' && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
              <h2 style={{ fontSize: '1.25rem', color: '#e8eaed', fontWeight: 700 }}>Verification Failed</h2>
              <p style={{ color: '#f28b82', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errorMsg}</p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1.25rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e8eaed', marginBottom: '0.5rem' }}>
                Need a new verification link?
              </div>
              <p style={{ fontSize: '0.75rem', color: '#9aa0a6', marginBottom: '0.875rem' }}>
                Enter your work email to receive a fresh verification link (2-minute cooldown apply).
              </p>

              {resendMsg && (
                <div style={{
                  padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: '0.8125rem', marginBottom: '0.75rem',
                  background: resendMsg.includes('sent') ? 'rgba(16,185,129,0.1)' : 'rgba(242,139,130,0.1)',
                  color: resendMsg.includes('sent') ? '#34d399' : '#f28b82',
                  border: `1px solid ${resendMsg.includes('sent') ? 'rgba(16,185,129,0.3)' : 'rgba(242,139,130,0.3)'}`,
                }}>
                  {resendMsg}
                </div>
              )}

              <input
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                style={{ marginBottom: '0.75rem' }}
              />

              <button
                className="btn btn-primary btn-full"
                onClick={handleResend}
                disabled={resending || !resendEmail}
              >
                {resending ? 'Sending…' : 'Resend Verification Link'}
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <Link to="/login" style={{ color: '#8ab4f8', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 }}>
                ← Back to Sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;
