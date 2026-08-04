import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { dashboardApi, jobApi, candidateApi } from '../api';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Stats {
  totalJobs: number;
  totalCandidates: number;
  completed: number;
  inProgress: number;
  linkSent: number;
  verified: number;
}

interface RecentCandidate {
  _id: string;
  name: string;
  email: string;
  status: string;
  jobId: { title: string };
  createdAt: string;
}

const statusBadge = (status: string) => {
  const map: Record<string, [string, string]> = {
    SCHEDULED: ['badge-neutral', 'Scheduled'],
    LINK_SENT: ['badge-info', 'Link Sent'],
    VERIFIED: ['badge-accent', 'Verified'],
    IN_PROGRESS: ['badge-warning', 'In Progress'],
    COMPLETED: ['badge-success', 'Completed'],
    EXPIRED: ['badge-danger', 'Expired'],
  };
  const [cls, label] = map[status] || ['badge-neutral', status];
  return <span className={`badge ${cls}`}>{label}</span>;
};

const DashboardPage: React.FC = () => {
  const { hr } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentCandidate[]>([]);
  const [jobs, setJobs] = useState<{ _id: string; title: string; totalCandidates: number; isActive: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, jobsRes] = await Promise.all([
          dashboardApi.stats(),
          jobApi.list(),
        ]);
        setStats(statsRes.data.data.stats);
        setRecent(statsRes.data.data.recentCandidates);
        setJobs(jobsRes.data.data.jobs.slice(0, 5));
      } catch {
        // handle silently
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="page-loader"><div className="spinner" /></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Dashboard</div>
          <div className="topbar-path">
            {hr?.companyName ? hr.companyName : 'Overview of your hiring activity'}
          </div>
        </div>
        <div className="topbar-right">
          <Link to="/jobs/new" className="btn btn-primary btn-sm">+ New Job</Link>
        </div>
      </div>

      <div className="page">
        {/* Profile incomplete banner */}
        {hr && !hr.profileComplete && (
          <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
            <span>ℹ</span>
            <span>
              Your company profile is incomplete.{' '}
              <Link to="/profile" style={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}>
                Complete it now
              </Link>{' '}
              to include your logo in candidate emails.
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total Jobs</div>
            <div className="stat-value">{stats?.totalJobs ?? 0}</div>
            <div className="stat-sub">Active positions</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Candidates</div>
            <div className="stat-value">{stats?.totalCandidates ?? 0}</div>
            <div className="stat-sub">Across all jobs</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Completed</div>
            <div className="stat-value">{stats?.completed ?? 0}</div>
            <div className="stat-sub">Interviews done</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">In Progress</div>
            <div className="stat-value">{(stats?.inProgress ?? 0) + (stats?.linkSent ?? 0)}</div>
            <div className="stat-sub">Awaiting interview</div>
          </div>
        </div>

        <div className="grid-2" style={{ gap: '1rem' }}>
          {/* Recent candidates */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div className="card-title">Recent Candidates</div>
              <Link to="/candidates" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="empty-icon">◻</div>
                <div className="empty-title">No candidates yet</div>
                <div className="empty-desc">Schedule your first interview to get started.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recent.map((c) => (
                  <div key={c._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.625rem 0', borderBottom: '1px solid var(--border)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {c.jobId?.title ?? '—'}
                      </div>
                    </div>
                    {statusBadge(c.status)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active jobs */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div className="card-title">Job Positions</div>
              <Link to="/jobs" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="empty-icon">◫</div>
                <div className="empty-title">No jobs created</div>
                <div className="empty-desc">Create your first job position to begin.</div>
                <Link to="/jobs/new" className="btn btn-secondary btn-sm">Create job</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {jobs.map((j) => (
                  <div key={j._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.625rem 0', borderBottom: '1px solid var(--border)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>{j.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {j.totalCandidates} candidate{j.totalCandidates !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <span className={`badge ${j.isActive ? 'badge-success' : 'badge-neutral'}`}>
                      {j.isActive ? 'Active' : 'Closed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default DashboardPage;
