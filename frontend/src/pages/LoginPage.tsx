import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSignIn } from '@clerk/clerk-react';
import AuthLayout from '../components/AuthLayout';

const LoginPage: React.FC = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Email / Password sign-in ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        // Set the active Clerk session
        await setActive({ session: result.createdSessionId });
        navigate('/dashboard');
      } else if (result.status === 'needs_first_factor') {
        setError('Additional verification required. Please check your email.');
      } else {
        setError('Sign-in could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      // Clerk wraps errors in { errors: [{ message, code }] }
      const clerkErrors = (err as { errors?: { message: string }[] })?.errors;
      const msg = clerkErrors?.[0]?.message ?? 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="auth-heading">Sign in</h1>
      <p className="auth-subheading">Welcome back to your HR portal.</p>

      {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <span>⚠</span> {error}
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

          {/* Clerk Bot Protection / Turnstile Container */}
          <div id="clerk-captcha" style={{ margin: '0.5rem 0' }}></div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading || !isLoaded}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

      <p className="auth-footer-text">
        Don't have an account?{' '}
        <Link to="/register">Create one</Link>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
