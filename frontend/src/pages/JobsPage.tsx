import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { jobApi } from '../api';

interface Job {
  _id: string;
  title: string;
  department: string;
  experienceLevel: string;
  language: string;
  isActive: boolean;
  totalCandidates: number;
  candidateStats: Record<string, number>;
  createdAt: string;
}

const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data } = await jobApi.list();
      setJobs(data.data.jobs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await jobApi.delete(id);
      setJobs((js) => js.filter((j) => j._id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (job: Job) => {
    try {
      await jobApi.update(job._id, { isActive: !job.isActive } as unknown as Parameters<typeof jobApi.update>[1]);
      setJobs((js) => js.map((j) => j._id === job._id ? { ...j, isActive: !j.isActive } : j));
    } catch { /* silent */ }
  };

  return (
    <AppShell>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Job Positions</div>
          <div className="topbar-path">{jobs.length} position{jobs.length !== 1 ? 's' : ''} created</div>
        </div>
        <div className="topbar-right">
          <Link to="/jobs/new" className="btn btn-primary btn-sm">+ New Job</Link>
        </div>
      </div>

      <div className="page">
        {loading ? (
          <div className="page-loader"><div className="spinner" /></div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◫</div>
            <div className="empty-title">No jobs yet</div>
            <div className="empty-desc">Create your first job position to start scheduling AI interviews.</div>
            <Link to="/jobs/new" className="btn btn-primary btn-sm">Create job</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Language</th>
                  <th>Candidates</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job._id}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{job.title}</div>
                      {job.experienceLevel && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{job.experienceLevel}</div>
                      )}
                    </td>
                    <td>{job.department || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {job.language}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{job.totalCandidates}</span>
                    </td>
                    <td>
                      <span className={`badge ${job.isActive ? 'badge-success' : 'badge-neutral'}`}>
                        {job.isActive ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                        <Link to={`/schedule?jobId=${job._id}`} className="btn btn-secondary btn-sm">
                          Schedule
                        </Link>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleToggle(job)}
                        >
                          {job.isActive ? 'Close' : 'Reopen'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(job._id)}
                          disabled={deletingId === job._id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default JobsPage;
