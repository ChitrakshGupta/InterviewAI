import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { jobApi, candidateApi } from '../api';

interface Job { _id: string; title: string; language: string; }

const SchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedJobId = params.get('jobId') || '';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', jobId: preselectedJobId });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successLink, setSuccessLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    jobApi.list().then((r) => setJobs(r.data.data.jobs)).catch(() => {});
  }, []);

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleFileChange = (file: File) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF or Word documents allowed.');
      return;
    }
    setResumeFile(file);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessLink('');
    if (!form.name || !form.email || !form.jobId) {
      setError('Name, email, and job are required.');
      return;
    }
    if (!resumeFile) {
      setError('Please attach the candidate resume.');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('email', form.email);
      fd.append('phone', form.phone);
      fd.append('jobId', form.jobId);
      fd.append('resume', resumeFile);
      const { data } = await candidateApi.schedule(fd);
      setSuccessLink(data.data.candidate.verificationLink || '');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to schedule candidate.');
    } finally {
      setSaving(false);
    }
  };

  if (successLink) {
    return (
      <AppShell>
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Interview Scheduled</div>
          </div>
        </div>
        <div className="page" style={{ maxWidth: 560 }}>
          <div className="card">
            <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
              <span>✓</span> Candidate scheduled and invitation email sent.
            </div>

            <div className="card-title" style={{ marginBottom: '0.5rem' }}>Verification Link</div>
            <p className="card-desc" style={{ marginBottom: '0.75rem' }}>
              If email is not configured, share this link directly with the candidate:
            </p>
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '0.625rem 0.75rem',
              fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)',
              wordBreak: 'break-all', marginBottom: '1rem'
            }}>
              {successLink}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                navigator.clipboard.writeText(successLink);
              }}>
                Copy link
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                setSuccessLink('');
                setForm({ name: '', email: '', phone: '', jobId: preselectedJobId });
                setResumeFile(null);
              }}>
                Schedule another
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/candidates')}>
                View candidates
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Schedule Interview</div>
          <div className="topbar-path">Add a candidate and send them an interview invitation</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
            {saving && <span className="btn-spinner" />}
            {saving ? 'Scheduling…' : 'Schedule & Send'}
          </button>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 560 }}>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><span>⚠</span> {error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Candidate Info */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ marginBottom: '1rem' }}>Candidate Details</div>

            <div className="form-field">
              <label className="form-label">Full Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="text" className="form-input" value={form.name} onChange={set('name')} placeholder="Alex Johnson" />
            </div>

            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Email <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input type="email" className="form-input" value={form.email} onChange={set('email')} placeholder="candidate@email.com" />
              </div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone (optional)</label>
                <input type="tel" className="form-input" value={form.phone} onChange={set('phone')} placeholder="+91 9876543210" />
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Job Position <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select className="form-select" value={form.jobId} onChange={set('jobId')}>
                <option value="">Select a job position…</option>
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>{j.title} ({j.language})</option>
                ))}
              </select>
              {jobs.length === 0 && (
                <div className="form-hint">
                  No jobs yet.{' '}
                  <a href="/jobs/new">Create one first →</a>
                </div>
              )}
            </div>
          </div>

          {/* Resume Upload */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title" style={{ marginBottom: '0.25rem' }}>Resume</div>
            <div className="card-desc" style={{ marginBottom: '1rem' }}>
              The AI will use this resume to personalise interview questions.
            </div>

            <div
              className={`file-drop${dragging ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              />
              <div className="file-drop-icon">📄</div>
              <div className="file-drop-text">Click to upload or drag and drop</div>
              <div className="file-drop-hint">PDF or Word document, max 10 MB</div>
            </div>

            {resumeFile && (
              <div className="file-selected">
                <span>✓</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {resumeFile.name}
                </span>
                <button type="button" className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                  onClick={(e) => { e.stopPropagation(); setResumeFile(null); }}>
                  Remove
                </button>
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="btn-spinner" />}
            {saving ? 'Scheduling…' : 'Schedule & Send Invitation'}
          </button>
        </form>
      </div>
    </AppShell>
  );
};

export default SchedulePage;
