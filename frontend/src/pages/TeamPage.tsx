import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { iamApi } from '../api';
import { useAuth } from '../context/AuthContext';

const ALL_PERMISSIONS = [
  { key: 'view_jobs', label: 'View Jobs', desc: 'View all job listings' },
  { key: 'manage_jobs', label: 'Manage Jobs', desc: 'Create, edit and delete job listings' },
  { key: 'schedule_interviews', label: 'Schedule Interviews', desc: 'Schedule candidates for interviews' },
  { key: 'view_candidates', label: 'View Candidates', desc: 'View candidate profiles and transcripts' },
  { key: 'view_reports', label: 'View Reports', desc: 'View interview reports and analytics' },
  { key: 'manage_team', label: 'Manage Team', desc: 'Invite, remove and edit permissions of members' },
];

const ROLE_TEMPLATES: Record<string, string[]> = {
  admin: ['view_jobs', 'manage_jobs', 'schedule_interviews', 'view_candidates', 'view_reports'],
  viewer: ['view_jobs', 'view_candidates', 'view_reports'],
  custom: [],
};

interface Member {
  _id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  mustChangePassword?: boolean;
  createdAt: string;
  isOwner?: boolean;
}

const PERM_BADGE_COLORS: Record<string, string> = {
  view_jobs: '#3b82f6',
  manage_jobs: '#8b5cf6',
  schedule_interviews: '#10b981',
  view_candidates: '#f59e0b',
  view_reports: '#6366f1',
  manage_team: '#ef4444',
};

const TeamPage: React.FC = () => {
  const { hr } = useAuth();
  const navigate = useNavigate();
  const isOwner = hr?.role === 'owner';

  const [members, setMembers] = useState<Member[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('admin');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(ROLE_TEMPLATES.admin);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Edit permissions modal state
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const { data } = await iamApi.listMembers();
      setMembers(data.data.members);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setListError(msg || 'Failed to load team members.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!isOwner && !hr?.permissions?.includes('manage_team')) {
      navigate('/dashboard');
      return;
    }
    fetchMembers();
  }, [isOwner, hr, navigate, fetchMembers]);

  const handleTemplateChange = (template: string) => {
    setSelectedTemplate(template);
    if (template !== 'custom') {
      setSelectedPerms(ROLE_TEMPLATES[template]);
    }
  };

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
    if (selectedTemplate !== 'custom') setSelectedTemplate('custom');
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteName || !inviteEmail) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviteLoading(true);
    try {
      const { data } = await iamApi.invite({ name: inviteName, email: inviteEmail, permissions: selectedPerms });
      setInviteSuccess(`✅ Invitation sent to ${inviteEmail}`);
      setInviteName('');
      setInviteEmail('');
      setSelectedTemplate('admin');
      setSelectedPerms(ROLE_TEMPLATES.admin);
      await fetchMembers();
      setTimeout(() => { setShowInvite(false); setInviteSuccess(''); }, 2000);
      void data;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setInviteError(msg || 'Failed to send invitation.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleEditPermissions = (member: Member) => {
    setEditTarget(member);
    setEditPerms([...member.permissions]);
    setEditError('');
  };

  const handleSavePermissions = async () => {
    if (!editTarget) return;
    setEditLoading(true);
    setEditError('');
    try {
      await iamApi.updatePermissions(editTarget._id, editPerms);
      await fetchMembers();
      setEditTarget(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setEditError(msg || 'Failed to update permissions.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleRemove = async (member: Member) => {
    if (!window.confirm(`Remove ${member.name} from the team?`)) return;
    setRemovingId(member._id);
    try {
      await iamApi.removeMember(member._id);
      await fetchMembers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e8eaed', margin: 0 }}>Team Management</h1>
          <p style={{ color: '#9aa0a6', fontSize: '0.875rem', marginTop: 4 }}>
            Invite members and control their access permissions
          </p>
        </div>
        {isOwner && (
          <button
            id="invite-member-btn"
            className="btn btn-primary"
            onClick={() => setShowInvite(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>+</span> Invite Member
          </button>
        )}
      </div>

      {/* Member List */}
      {loadingList ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9aa0a6' }}>Loading team…</div>
      ) : listError ? (
        <div className="alert alert-error">{listError}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {members.map((member) => (
            <div key={member._id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: member.isOwner ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '1.125rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
            }}>
              {/* Avatar */}
              <div style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: member.isOwner
                  ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                  : 'linear-gradient(135deg, #1e293b, #334155)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.125rem', fontWeight: 700, color: 'white',
              }}>
                {member.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#e8eaed' }}>{member.name}</span>
                  {member.isOwner && (
                    <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>OWNER</span>
                  )}
                  {member.mustChangePassword && (
                    <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 20 }}>⏳ Pending setup</span>
                  )}
                </div>
                <div style={{ color: '#9aa0a6', fontSize: '0.8125rem', marginTop: 2 }}>{member.email}</div>
              </div>

              {/* Permissions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flex: 2, minWidth: 200 }}>
                {member.isOwner ? (
                  <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontStyle: 'italic' }}>All permissions (owner)</span>
                ) : member.permissions.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>No permissions assigned</span>
                ) : (
                  member.permissions.map((p) => (
                    <span key={p} style={{
                      fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                      background: `${PERM_BADGE_COLORS[p] ?? '#6b7280'}22`,
                      color: PERM_BADGE_COLORS[p] ?? '#9aa0a6',
                      border: `1px solid ${PERM_BADGE_COLORS[p] ?? '#6b7280'}44`,
                    }}>
                      {ALL_PERMISSIONS.find((x) => x.key === p)?.label ?? p}
                    </span>
                  ))
                )}
              </div>

              {/* Actions */}
              {isOwner && !member.isOwner && (
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}
                    onClick={() => handleEditPermissions(member)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn"
                    style={{
                      fontSize: '0.8125rem', padding: '0.375rem 0.875rem',
                      background: 'rgba(239,68,68,0.12)', color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.25)',
                    }}
                    onClick={() => handleRemove(member)}
                    disabled={removingId === member._id}
                  >
                    {removingId === member._id ? '…' : 'Remove'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Invite Modal ─────────────────────────────────────── */}
      {showInvite && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowInvite(false); setInviteError(''); } }}
        >
          <div style={{
            background: '#16161e', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 18, padding: '2rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e8eaed', margin: 0 }}>Invite Team Member</h2>
              <button onClick={() => { setShowInvite(false); setInviteError(''); }}
                style={{ background: 'none', border: 'none', color: '#9aa0a6', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
            </div>

            {inviteSuccess ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                <p style={{ color: '#34d399', fontWeight: 600 }}>{inviteSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleInvite} noValidate>
                {inviteError && (
                  <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                    <span>⚠</span> {inviteError}
                  </div>
                )}

                <div className="form-field">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" placeholder="Jane Smith"
                    value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label">Work Email</label>
                  <input type="email" className="form-input" placeholder="jane@company.com"
                    value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                </div>

                {/* Role Template Selector */}
                <div className="form-field">
                  <label className="form-label">Quick Role Template</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['admin', 'viewer', 'custom'] as const).map((t) => (
                      <button key={t} type="button"
                        onClick={() => handleTemplateChange(t)}
                        style={{
                          padding: '0.375rem 1rem', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 500,
                          cursor: 'pointer', border: '1px solid',
                          background: selectedTemplate === t ? 'rgba(99,102,241,0.2)' : 'transparent',
                          borderColor: selectedTemplate === t ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)',
                          color: selectedTemplate === t ? '#a5b4fc' : '#9aa0a6',
                        }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Permission Checkboxes */}
                <div className="form-field">
                  <label className="form-label">Permissions</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ALL_PERMISSIONS.map(({ key, label, desc }) => {
                      const checked = selectedPerms.includes(key);
                      return (
                        <label key={key} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                          padding: '0.625rem 0.875rem', borderRadius: 10, cursor: 'pointer',
                          background: checked ? 'rgba(99,102,241,0.09)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${checked ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'all 0.15s',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => togglePerm(key)}
                            style={{ marginTop: 2, accentColor: '#6366f1', width: 15, height: 15, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: checked ? '#a5b4fc' : '#e8eaed' }}>{label}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 1 }}>{desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={inviteLoading} style={{ marginTop: '0.5rem' }}>
                  {inviteLoading && <span className="btn-spinner" />}
                  {inviteLoading ? 'Sending invite…' : 'Send Invitation →'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Permissions Modal ────────────────────────────── */}
      {editTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}
        >
          <div style={{
            background: '#16161e', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 18, padding: '2rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#e8eaed', margin: 0 }}>Edit Permissions</h2>
                <p style={{ color: '#9aa0a6', fontSize: '0.8125rem', marginTop: 3 }}>{editTarget.name} · {editTarget.email}</p>
              </div>
              <button onClick={() => setEditTarget(null)}
                style={{ background: 'none', border: 'none', color: '#9aa0a6', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
            </div>

            {editError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠</span> {editError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {ALL_PERMISSIONS.map(({ key, label, desc }) => {
                const checked = editPerms.includes(key);
                return (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    padding: '0.625rem 0.875rem', borderRadius: 10, cursor: 'pointer',
                    background: checked ? 'rgba(99,102,241,0.09)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${checked ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setEditPerms((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key])}
                      style={{ marginTop: 2, accentColor: '#6366f1', width: 15, height: 15, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: checked ? '#a5b4fc' : '#e8eaed' }}>{label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 1 }}>{desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSavePermissions} disabled={editLoading}>
                {editLoading ? 'Saving…' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamPage;
