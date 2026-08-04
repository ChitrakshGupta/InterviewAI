import React, { useEffect, useState, useRef } from 'react';
import AppShell from '../components/AppShell';
import { hrApi } from '../api';
import { useAuth } from '../context/AuthContext';

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Education', 'E-Commerce',
  'Manufacturing', 'Consulting', 'Media', 'Real Estate', 'Other',
];

const ProfilePage: React.FC = () => {
  const { hr, refreshUser } = useAuth();
  const [form, setForm] = useState({
    name: '', companyName: '', companyDescription: '',
    website: '', industry: '', companySize: '', location: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await hrApi.getProfile();
        const h = data.data.hr;
        setForm({
          name: h.name || '',
          companyName: h.companyName || '',
          companyDescription: h.companyDescription || '',
          website: h.website || '',
          industry: h.industry || '',
          companySize: h.companySize || '',
          location: h.location || '',
        });
        if (h.companyLogo) setLogoPreview(h.companyLogo);
      } catch {
        // silent
      }
    };
    load();
  }, []);

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logoFile) fd.append('logo', logoFile);
      await hrApi.updateProfile(fd);
      await refreshUser();
      setSuccess('Profile updated successfully.');
    } catch {
      setError('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Company Profile</div>
          <div className="topbar-path">Manage your company information</div>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 640 }}>
        {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}><span>✓</span> {success}</div>}
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><span>⚠</span> {error}</div>}

        {!hr?.profileComplete && (
          <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
            <span>ℹ</span> Complete your profile so candidates see your company in interview emails.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Logo */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ marginBottom: '1rem' }}>Company Logo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0
              }}>
                {logoPreview ? (
                  <img src={logoPreview}
                    alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>🏢</span>
                )}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  Upload logo
                </button>
                <div className="form-hint">PNG, JPG up to 2 MB</div>
              </div>
            </div>
          </div>

          {/* Basic info */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ marginBottom: '1rem' }}>Basic Information</div>

            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Your Name</label>
                <input type="text" className="form-input" value={form.name} onChange={set('name')} placeholder="Jane Smith" />
              </div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Company Name</label>
                <input type="text" className="form-input" value={form.companyName} onChange={set('companyName')} placeholder="Acme Corp" />
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={form.companyDescription} onChange={set('companyDescription')}
                placeholder="Brief description of your company…" style={{ minHeight: 80 }} />
            </div>

            <div className="form-field">
              <label className="form-label">Website</label>
              <input type="url" className="form-input" value={form.website} onChange={set('website')} placeholder="https://yourcompany.com" />
            </div>
          </div>

          {/* Company details */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title" style={{ marginBottom: '1rem' }}>Company Details</div>

            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Industry</label>
                <select className="form-select" value={form.industry} onChange={set('industry')}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Company Size</label>
                <select className="form-select" value={form.companySize} onChange={set('companySize')}>
                  <option value="">Select size</option>
                  {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Location</label>
              <input type="text" className="form-input" value={form.location} onChange={set('location')} placeholder="Bangalore, India" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="btn-spinner" />}
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>
    </AppShell>
  );
};

export default ProfilePage;
