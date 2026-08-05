import React from 'react';
import { useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

// Phase 3 placeholder — to be implemented with Sarvam AI voice
const InterviewRoomPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { theme, toggle } = useTheme();

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', textAlign: 'center'
    }}>
      <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
        <button className="theme-toggle" onClick={toggle}>{theme === 'dark' ? '☀' : '☾'}</button>
      </div>

      <div style={{
        width: 48, height: 48, borderRadius: 'var(--radius-lg)',
        background: 'var(--accent)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'white', fontSize: '1.25rem',
        marginBottom: '1.5rem'
      }}>
        🎙
      </div>

      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>AI Interview</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: 360, marginBottom: '2rem' }}>
        Phase 3 (AI Voice Interview) coming soon. This room will host a live conversation
        powered by Sarvam AI speech-to-text and text-to-speech.
      </p>

      <div style={{
        background: 'var(--bg-subtle)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem',
        maxWidth: 400, width: '100%', textAlign: 'left'
      }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
          Session Token
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          {token}
        </div>
      </div>
    </div>
  );
};

export default InterviewRoomPage;
