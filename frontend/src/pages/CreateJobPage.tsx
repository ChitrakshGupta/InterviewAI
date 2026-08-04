import React, { useState, useEffect, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { jobApi, languagesApi } from '../api';

interface Language { code: string; name: string; }

const EXPERIENCE_LEVELS = ['Internship', 'Entry Level', 'Mid Level', 'Senior Level', 'Lead', 'Manager', 'Director', 'Executive'];

const LANG_FLAGS: Record<string, string> = {
  'en-IN': '🇬🇧', 'hi-IN': '🇮🇳', 'bn-IN': '🇧🇩', 'gu-IN': '🇮🇳',
  'kn-IN': '🇮🇳', 'ml-IN': '🇮🇳', 'mr-IN': '🇮🇳', 'od-IN': '🇮🇳',
  'pa-IN': '🇮🇳', 'ta-IN': '🇮🇳', 'te-IN': '🇮🇳',
};

const CreateJobPage: React.FC = () => {
  const navigate = useNavigate();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [form, setForm] = useState({
    title: '', department: '', experienceLevel: '',
    description: '', requirements: '', language: 'en-IN',
  });
  const [questions, setQuestions] = useState<string[]>([]);
  const [qInput, setQInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    languagesApi.list().then((r) => setLanguages(r.data.data.languages)).catch(() => {});
  }, []);

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const addQuestion = () => {
    const q = qInput.trim();
    if (q && !questions.includes(q)) {
      setQuestions((qs) => [...qs, q]);
      setQInput('');
    }
  };

  const handleQKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addQuestion(); }
  };

  const removeQuestion = (idx: number) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title || !form.description) {
      setError('Job title and description are required.');
      return;
    }
    setSaving(true);
    try {
      await jobApi.create({ ...form, preferredQuestions: questions });
      navigate('/jobs');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to create job.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Create Job</div>
          <div className="topbar-path">Define the position you want to hire for</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/jobs')}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
            {saving && <span className="btn-spinner" />}
            {saving ? 'Saving…' : 'Create job'}
          </button>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 680 }}>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><span>⚠</span> {error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Job basics */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ marginBottom: '1rem' }}>Job Details</div>

            <div className="form-field">
              <label className="form-label">Job Title <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="text" className="form-input" value={form.title} onChange={set('title')}
                placeholder="e.g. Senior Frontend Engineer" />
            </div>

            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Department</label>
                <input type="text" className="form-input" value={form.department} onChange={set('department')}
                  placeholder="e.g. Engineering" />
              </div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Experience Level</label>
                <select className="form-select" value={form.experienceLevel} onChange={set('experienceLevel')}>
                  <option value="">Select level</option>
                  {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Job Description <span style={{ color: 'var(--danger)' }}>*</span></label>
              <textarea className="form-textarea" value={form.description} onChange={set('description')}
                placeholder="Describe the role, responsibilities, and what you're looking for…" style={{ minHeight: 120 }} />
              <div className="form-hint">The AI interviewer will use this to ask relevant questions.</div>
            </div>

            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Requirements</label>
              <textarea className="form-textarea" value={form.requirements} onChange={set('requirements')}
                placeholder="Skills, qualifications, tools required…" style={{ minHeight: 80 }} />
            </div>
          </div>

          {/* Preferred questions */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ marginBottom: '0.25rem' }}>Preferred Questions</div>
            <div className="card-desc" style={{ marginBottom: '1rem' }}>
              Add specific questions you want the AI to ask candidates. Press Enter to add.
            </div>

            <div className="chips-box" onClick={() => document.getElementById('q-input')?.focus()}>
              {questions.map((q, i) => (
                <div key={i} className="chip">
                  <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q}</span>
                  <button type="button" className="chip-remove" onClick={() => removeQuestion(i)}>×</button>
                </div>
              ))}
              <input
                id="q-input"
                className="chips-input"
                placeholder={questions.length === 0 ? 'Type a question and press Enter…' : 'Add another…'}
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={handleQKeyDown}
                onBlur={addQuestion}
              />
            </div>
            <div className="form-hint">{questions.length} question{questions.length !== 1 ? 's' : ''} added</div>
          </div>

          {/* Interview language */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title" style={{ marginBottom: '0.25rem' }}>Interview Language</div>
            <div className="card-desc" style={{ marginBottom: '1rem' }}>
              Select the language for the AI voice interview (Sarvam AI powered).
            </div>

            <div className="lang-grid">
              {languages.map((lang) => (
                <div
                  key={lang.code}
                  className={`lang-option${form.language === lang.code ? ' selected' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, language: lang.code }))}
                >
                  <div className="lang-flag">{LANG_FLAGS[lang.code] || '🌐'}</div>
                  <div className="lang-name">{lang.name}</div>
                  <div className="lang-code">{lang.code}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving && <span className="btn-spinner" />}
              {saving ? 'Creating…' : 'Create job'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/jobs')}>Cancel</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
};

export default CreateJobPage;
