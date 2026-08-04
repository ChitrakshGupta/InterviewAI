import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { candidateApi } from '../api';

interface Candidate {
  _id: string;
  name: string;
  email: string;
  status: string;
  jobId: { title: string; language: string };
  createdAt: string;
  resumeOriginalName: string;
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
                        {c.status === 'COMPLETED' && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>✓ Done</span>
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
    </AppShell>
  );
};

export default CandidatesPage;
