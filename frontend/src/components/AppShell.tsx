import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  count?: number;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, count }) => (
  <NavLink
    to={to}
    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
  >
    <span className="nav-icon">{icon}</span>
    <span>{label}</span>
    {count !== undefined && <span className="nav-count">{count}</span>}
  </NavLink>
);

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hr, logout, hasPermission } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = hr?.name
    ? hr.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'HR';

  const isOwner = hr?.role === 'owner';
  const canManageTeam = isOwner || hasPermission('manage_team');

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="brand-mark">H</div>
            <span className="brand-name">HireAI</span>
          </div>
          <button className="theme-toggle" onClick={toggle} title="Toggle theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Overview</div>
          <NavItem to="/dashboard" icon="⊞" label="Dashboard" />

          <div className="nav-section-label">Hiring</div>
          {hasPermission('view_jobs') && <NavItem to="/jobs" icon="◫" label="Job Positions" />}
          {hasPermission('view_candidates') && <NavItem to="/candidates" icon="◻" label="Candidates" />}
          {hasPermission('schedule_interviews') && <NavItem to="/schedule" icon="⊕" label="Schedule Interview" />}

          {canManageTeam && (
            <>
              <div className="nav-section-label">Team</div>
              <NavItem to="/team" icon="⊛" label="Team Members" />
            </>
          )}

          <div className="nav-section-label">Settings</div>
          <NavItem to="/profile" icon="⊙" label="Company Profile" />
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user" onClick={handleLogout} title="Click to sign out">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {hr?.name}
                {hr?.role && (
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em',
                    padding: '1px 6px', borderRadius: 20, textTransform: 'uppercase',
                    background: isOwner ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
                    color: isOwner ? '#a5b4fc' : '#9aa0a6',
                    border: `1px solid ${isOwner ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  }}>
                    {isOwner ? 'Owner' : 'Member'}
                  </span>
                )}
              </div>
              <div className="user-email">{hr?.email}</div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>↗</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">{children}</main>
    </div>
  );
};

export default AppShell;
