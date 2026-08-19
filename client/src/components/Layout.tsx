import { NavLink, Outlet } from "react-router-dom";
import { useAuth, roleAtLeast } from "../auth/AuthContext";
import { initials } from "../lib/initials";

const ICONS: Record<string, JSX.Element> = {
  drives: (
    <svg className="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4.5" width="15" height="12" rx="1.5" />
      <path d="M2.5 8.5h15" strokeLinecap="round" />
      <path d="M6.5 2.5v3M13.5 2.5v3" strokeLinecap="round" />
    </svg>
  ),
  setup: (
    <svg className="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="2.4" />
      <path
        d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.9 5.1l-1.4 1.4M6.5 13.5l-1.4 1.4M14.9 14.9l-1.4-1.4M6.5 6.5L5.1 5.1"
        strokeLinecap="round"
      />
    </svg>
  ),
  teams: (
    <svg className="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="6.5" r="2.3" />
      <circle cx="14" cy="7.5" r="1.9" />
      <path d="M2.5 16c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5M12.3 11.9c2.1.1 3.7 1.7 3.7 4.1" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg className="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" strokeLinecap="round" />
    </svg>
  ),
  reports: (
    <svg className="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 16.5V9M10 16.5V3.5M16 16.5V11.5" strokeLinecap="round" />
    </svg>
  ),
  summary: (
    <svg className="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3" width="13" height="14" rx="1.5" />
      <path d="M6.5 7.5h7M6.5 10.5h7M6.5 13.5h4" strokeLinecap="round" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 4H4.5a1 1 0 00-1 1v10a1 1 0 001 1H8M13 14l4-4-4-4M17 10H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return <Outlet />;

  const isAdmin = roleAtLeast(user.role, "ADMIN");
  const isCaptainUp = roleAtLeast(user.role, "CAPTAIN");

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <img src="/brand/logo-white.png" alt="Preferred Square" />
        </div>
        <nav className="app-sidebar-nav">
          <NavLink to="/my-drives">
            {ICONS.drives}
            My Drives
          </NavLink>
          <NavLink to="/my-summary">
            {ICONS.summary}
            My Summary
          </NavLink>
          {isCaptainUp && (
            <NavLink to="/drives">
              {ICONS.drives}
              Drives
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/setup">
              {ICONS.setup}
              Setup
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/teams">
              {ICONS.teams}
              Teams
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/users">
              {ICONS.users}
              Users
            </NavLink>
          )}
          <NavLink to="/reports">
            {ICONS.reports}
            Reports
          </NavLink>
        </nav>
        <div className="app-sidebar-footer">
          <div className="app-user-avatar">{initials(user.name)}</div>
          <div className="app-user-meta">
            <div className="app-user-name">{user.name}</div>
            <div className="app-user-role">{user.role.replace(/_/g, " ").toLowerCase()}</div>
          </div>
          <button className="app-logout-btn" onClick={logout} title="Log out" aria-label="Log out">
            {ICONS.logout}
          </button>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
