import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { candidateApi } from '../api';

interface EvaluationReport {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  recommendation: string;
}

interface Candidate {
  _id: string;
  name: string;
  email: string;
  status: string;
  jobId: { title: string; language: string };
  createdAt: string;
  resumeOriginalName: string;
  evaluationReport?: EvaluationReport;
  faceWarnings?: number;
  interviewEndReason?: string;
}

const STATUS_BADGE: Record<string, [string, string]> = {
  SCHEDULED:   ['badge-neutral',  'Scheduled'],
  LINK_SENT:   ['badge-info',     'Link Sent'],
  VERIFIED:    ['badge-accent',   'Verified'],
  IN_PROGRESS: ['badge-warning',  'In Progress'],
  COMPLETED:   ['badge-success',  'Completed'],
  EXPIRED:     ['badge-danger',   'Expired'],
};

const CandidatesPage: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [resending, setResending] = useState<string | null>(null);
  const [selectedEval, setSelectedEval] = useState<{ name: string; report: EvaluationReport; warnings?: number; reason?: string } | null>(null);

  useEffect(() => {
    candidateApi.list().then((r) => {
      setCandidates(r.data.data.candidates);
    }).finally(() => setLoading(false));
  }, []);

  const handleResend = async (id: string) => {
    setResending(id);
    try {
      await candidateApi.resendLink(id);
      alert('Link resent successfully!');
    } catch {
      alert('Failed to resend link.');
    } finally {
      setResending(null);
    }
  };

  const filtered = filter
    ? candidates.filter((c) => c.status === filter)
    : candidates;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <AppShell>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Candidates</div>
          <div className="topbar-path">{candidates.length} total · {candidates.filter((c) => c.status === 'COMPLETED').length} completed</div>
        </div>
        <div className="topbar-right">
          <select
            className="form-select"
            style={{ width: 'auto', padding: '0.375rem 2rem 0.375rem 0.625rem', fontSize: '0.8125rem' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_BADGE).map(([k, [, label]]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="page">
        {loading ? (
          <div className="page-loader"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◻</div>
            <div className="empty-title">No candidates found</div>
            <div className="empty-desc">
              {filter ? 'Try a different filter.' : 'Schedule your first interview to see candidates here.'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Position</th>
                  <th>Language</th>
                  <th>Resume</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const [cls, label] = STATUS_BADGE[c.status] || ['badge-neutral', c.status];
                  return (
                    <tr key={c._id}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.email}</div>
                      </td>
                      <td>{c.jobId?.title ?? '—'}</td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {c.jobId?.language ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} title={c.resumeOriginalName}>
                          {c.resumeOriginalName.length > 20
                            ? c.resumeOriginalName.slice(0, 18) + '…'
                            : c.resumeOriginalName}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>{fmtDate(c.createdAt)}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td>
                        {['SCHEDULED', 'LINK_SENT', 'EXPIRED'].includes(c.status) && (
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={resending === c._id}
                            onClick={() => handleResend(c._id)}
                          >
                            {resending === c._id ? 'Resending…' : 'Resend Link'}
                          </button>
                        )}
                        {c.status === 'COMPLETED' && c.evaluationReport && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setSelectedEval({
                              name: c.name,
                              report: c.evaluationReport!,
                              warnings: c.faceWarnings,
                              reason: c.interviewEndReason,
                            })}
                          >
                            View Report ({c.evaluationReport.overallScore}/10)
                          </button>
                        )}
                        {c.status === 'COMPLETED' && !c.evaluationReport && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Evaluating…</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedEval && (
        <div className="face-warning-modal-overlay" onClick={() => setSelectedEval(null)}>
          <div className="card" style={{ maxWidth: 500, width: '100%', background: 'var(--bg-subtle)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>AI Evaluation: {selectedEval.name}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedEval(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', background: 'var(--bg)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{selectedEval.report.overallScore}/10</div>
              <div>
                <span className={`badge ${selectedEval.report.recommendation === 'STRONGLY_RECOMMENDED' || selectedEval.report.recommendation === 'RECOMMENDED' ? 'badge-success' : 'badge-warning'}`}>
                  {selectedEval.report.recommendation.replace('_', ' ')}
                </span>
                {selectedEval.warnings ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: 2 }}>
                    ⚠️ {selectedEval.warnings} Face Warning(s)
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>SUMMARY</strong>
              <p style={{ marginTop: '0.25rem', lineHeight: 1.5 }}>{selectedEval.report.summary}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <strong style={{ fontSize: '0.75rem', color: 'var(--success)' }}>STRENGTHS</strong>
                <ul style={{ paddingLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8125rem' }}>
                  {selectedEval.report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div>
                <strong style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>WEAKNESSES</strong>
                <ul style={{ paddingLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8125rem' }}>
                  {selectedEval.report.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>

            <button className="btn btn-secondary btn-full" onClick={() => setSelectedEval(null)}>Close</button>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default CandidatesPage;
