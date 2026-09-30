import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const Ic = {
  Bot: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><path d="M8 14h.01M16 14h.01" /><path d="M9 18h6" />
    </svg>
  ),
  Shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Globe: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
    </svg>
  ),
  Back: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 19l-7-7 7-7" />
    </svg>
  ),
};

const ASIDE_FEATURES = [
  { ic: Ic.Bot, title: 'AI-conducted interviews', desc: 'Structured voice interviews that scale with your pipeline.' },
  { ic: Ic.Shield, title: 'Verified candidates', desc: 'Camera-based identity checks before every session.' },
  { ic: Ic.Globe, title: 'Any language', desc: 'Interview candidates in the language they know best.' },
];

/**
 * AuthLayout — split-screen wrapper for sign in / sign up.
 * Left: the form (children). Right: branded marketing panel (hidden on mobile).
 */
const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggle } = useTheme();

  return (
    <div className="auth-split">
      <div className="auth-split-form">
        <div className="auth-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <Link to="/" className="auth-back">{Ic.Back} Back to home</Link>
            <button className="theme-toggle" onClick={toggle} title="Toggle theme">
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
          {children}
        </div>
      </div>

      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <Link to="/" className="lp-brand" style={{ marginBottom: '2rem' }}>
            <span className="lp-brand-mark">H</span> HireAI
          </Link>
          <div className="auth-aside-quote">
            The fastest way to interview every candidate — fairly, in any language, around the clock.
          </div>
          {ASIDE_FEATURES.map((f) => (
            <div className="auth-aside-feature" key={f.title}>
              <span className="ic">{f.ic}</span>
              <div>
                <div className="auth-aside-feature-title">{f.title}</div>
                <div className="auth-aside-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default AuthLayout;
