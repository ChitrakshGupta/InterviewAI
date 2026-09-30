import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

/* ── Inline icons (currentColor, theme-aware) ─────────────── */
const Icon = {
  Bot: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" />
      <path d="M8 14h.01M16 14h.01" /><path d="M9 18h6" />
    </svg>
  ),
  Shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Globe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
    </svg>
  ),
  Transcript: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H8l-4 4V4Z" /><path d="M8 9h8M8 12h5" />
    </svg>
  ),
  Users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 15h.01M12 15h.01M16 15h.01" />
    </svg>
  ),
  Check: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-11 11-5-5" />
    </svg>
  ),
  ArrowRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  ArrowLeft: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 19l-7-7 7-7" />
    </svg>
  ),
  Spark: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
    </svg>
  ),
};

const FEATURES = [
  {
    icon: Icon.Bot,
    title: 'AI-conducted interviews',
    desc: 'A conversational AI interviewer asks role-specific questions by voice, listens, follows up, and adapts — just like a real screening call.',
  },
  {
    icon: Icon.Shield,
    title: 'Identity verification',
    desc: 'Live camera face-detection confirms the right candidate shows up before the interview begins, keeping your pipeline honest.',
  },
  {
    icon: Icon.Globe,
    title: 'Multi-language support',
    desc: 'Run interviews in the candidate’s preferred language so you assess skills, not fluency in a second tongue.',
  },
  {
    icon: Icon.Transcript,
    title: 'Live transcripts & scoring',
    desc: 'Every answer is transcribed in real time and summarized, so reviewers can skim, compare, and decide in minutes.',
  },
  {
    icon: Icon.Calendar,
    title: 'One-click scheduling',
    desc: 'Send branded invite links by email. Candidates interview whenever they’re ready — no calendar tetris required.',
  },
  {
    icon: Icon.Users,
    title: 'Team roles & permissions',
    desc: 'Invite your hiring team with granular access. Owners manage everything; members see only what they need.',
  },
];

const STEPS = [
  { n: '1', title: 'Post a role', desc: 'Create a job, pick the interview language, and add the questions or skills you want to probe.' },
  { n: '2', title: 'Invite candidates', desc: 'Send a secure interview link. Candidates verify their identity and start whenever suits them.' },
  { n: '3', title: 'Review & decide', desc: 'Read transcripts, check scores, and move the strongest candidates forward — all from one dashboard.' },
];

const LandingPage: React.FC = () => {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden />

      {/* ── Nav ── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <span className="lp-brand-mark">H</span>
            HireAI
          </Link>
          <div className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#how" className="lp-nav-link">How it works</a>
          </div>
          <div className="lp-nav-actions">
            <button className="theme-toggle" onClick={toggle} title="Toggle theme">
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <Link to="/login" className="btn btn-ghost">Sign in</Link>
            <Link to="/register" className="btn btn-primary">Get started</Link>
          </div>
        </div>
      </nav>

      <div className="lp-inner">
        {/* ── Hero ── */}
        <section className="lp-hero">
          <div>
            <span className="lp-eyebrow">
              <span className="lp-dot" /> AI hiring, done right
            </span>
            <h1 className="lp-h1">
              Screen every candidate with an <span className="grad">AI interviewer</span> that never sleeps.
            </h1>
            <p className="lp-sub">
              HireAI runs structured, voice-based interviews at scale — verifying identity,
              transcribing answers, and surfacing your best candidates so your team can focus
              on the people who matter.
            </p>
            <div className="lp-cta-row">
              <Link to="/register" className="btn btn-primary btn-xl">
                Start hiring free {Icon.ArrowRight}
              </Link>
              <a href="#how" className="btn btn-secondary btn-xl">See how it works</a>
            </div>
            <div className="lp-trust">
              <span className="lp-trust-item">{Icon.Check} No credit card required</span>
              <span className="lp-trust-item">{Icon.Check} Set up in minutes</span>
            </div>
          </div>

          {/* Product preview */}
          <div className="lp-hero-visual">
            <div className="lp-float tl">
              <span className="ic" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>{Icon.Shield}</span>
              Identity verified
            </div>
            <div className="lp-float br">
              <span className="ic" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>{Icon.Spark}</span>
              Score: 8.6 / 10
            </div>

            <div className="lp-preview-bar">
              <span className="lp-preview-dot r" /><span className="lp-preview-dot y" /><span className="lp-preview-dot g" />
              <span className="lp-preview-label">Interview room</span>
            </div>
            <div className="lp-preview-grid">
              <div className="lp-preview-tile">
                <span className="live">LIVE</span>
                <div className="lp-orb" />
                <span className="tag">AI Interviewer</span>
              </div>
              <div className="lp-preview-tile">
                <div className="lp-avatar">JS</div>
                <span className="tag">Jane Smith</span>
              </div>
            </div>
            <div className="lp-preview-transcript">
              <div className="lp-tr-line">
                <span className="lp-tr-role ai">AI</span>
                <span className="lp-tr-text">Walk me through how you’d design a rate limiter.</span>
              </div>
              <div className="lp-tr-line">
                <span className="lp-tr-role you">JS</span>
                <span className="lp-tr-text">I’d start with a token-bucket approach so bursts are handled gracefully…</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="lp-section" style={{ paddingTop: '1rem' }}>
          <div className="lp-stats">
            <div className="lp-stat"><div className="lp-stat-val">10×</div><div className="lp-stat-label">Faster screening</div></div>
            <div className="lp-stat"><div className="lp-stat-val">24/7</div><div className="lp-stat-label">Always available</div></div>
            <div className="lp-stat"><div className="lp-stat-val">100%</div><div className="lp-stat-label">Structured & fair</div></div>
            <div className="lp-stat"><div className="lp-stat-val">0</div><div className="lp-stat-label">Scheduling headaches</div></div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="lp-section" id="features">
          <div className="lp-section-head">
            <div className="lp-kicker">Features</div>
            <h2 className="lp-h2">Everything you need to interview at scale</h2>
            <p className="lp-section-sub">
              From the first invite to the final decision, HireAI handles the repetitive work
              so your team can spend its time on judgment, not logistics.
            </p>
          </div>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.title}>
                <div className="lp-feature-icon">{f.icon}</div>
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="lp-section" id="how">
          <div className="lp-section-head">
            <div className="lp-kicker">How it works</div>
            <h2 className="lp-h2">From open role to hired in three steps</h2>
            <p className="lp-section-sub">No new workflows to learn. Post, invite, review.</p>
          </div>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div className="lp-step" key={s.n}>
                <div className="lp-step-num">{s.n}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="lp-section">
          <div className="lp-cta">
            <h2 className="lp-h2">Ready to meet your next great hire?</h2>
            <p className="lp-cta-sub">
              Set up your HR portal, post your first role, and send an interview link today.
            </p>
            <div className="lp-cta-row" style={{ justifyContent: 'center' }}>
              <Link to="/register" className="btn btn-primary btn-xl">
                Get started free {Icon.ArrowRight}
              </Link>
              <Link to="/login" className="btn btn-secondary btn-xl">Sign in</Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <Link to="/" className="lp-brand" style={{ fontSize: '0.9375rem' }}>
            <span className="lp-brand-mark" style={{ width: 26, height: 26, fontSize: 13 }}>H</span>
            HireAI
          </Link>
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Get started</Link>
          </div>
          <div className="lp-footer-copy">© {new Date().getFullYear()} HireAI. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
