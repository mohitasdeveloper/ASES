'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@/lib/auth';

interface NavItem {
  id: string;
  icon: string;
  label: string;
  href: string;
}
interface NavHeader {
  isHeader: true;
  label: string;
}
type NavEntry = NavItem | NavHeader;

const ADMIN_MENU: NavEntry[] = [
  { isHeader: true, label: 'Main Menu' },
  { id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
  { id: 'master-timetable', href: '/master-timetable', label: 'Master Timetable', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { id: 'weekly-timetable', href: '/weekly-timetable', label: 'Weekly Timetable', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><line x1="22" y1="10" x2="2" y2="10"/><line x1="8" y1="10" x2="8" y2="22"/><line x1="16" y1="10" x2="16" y2="22"/>' },
  { id: 'daily-scheduler', href: '/daily-scheduler', label: 'Daily Scheduler', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
  { id: 'execution', href: '/execution', label: 'Execution Log', icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
  { id: 'leaves', href: '/leaves', label: 'Faculty Leaves', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>' },
  { id: 'remarks', href: '/remarks', label: 'Faculty Remarks', icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>' },
  { id: 'reports', href: '/reports', label: 'Reports', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' },
  { isHeader: true, label: 'Master Data' },
  { id: 'courses', href: '/courses', label: 'Courses', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
  { id: 'subjects', href: '/subjects', label: 'Subjects', icon: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>' },
  { id: 'rooms', href: '/rooms', label: 'Rooms', icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>' },
  { id: 'csf-mapping', href: '/csf-mapping', label: 'CSF Mapping', icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' },
  { isHeader: true, label: 'System Setup' },
  { id: 'holidays', href: '/holidays', label: 'Holidays', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h8"/><path d="M8 18h4"/>' },
  { id: 'users', href: '/users', label: 'Users', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
];

const FACULTY_MENU: NavEntry[] = [
  { isHeader: true, label: 'Faculty Menu' },
  { id: 'faculty-portal', href: '/faculty-portal', label: 'My Portal', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
];

export default function Sidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = (localStorage.getItem('ases_theme') as 'light' | 'dark') || 'light';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggleTheme(checked: boolean) {
    const next = checked ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ases_theme', next);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const menu = session.role === 'faculty' ? FACULTY_MENU : ADMIN_MENU;
  const initial = (session.profile?.full_name || 'U').charAt(0).toUpperCase();
  let roleText = session.role || 'Faculty';
  if (roleText === 'super_admin') roleText = 'Super Admin';
  const roleLabel = roleText.charAt(0).toUpperCase() + roleText.slice(1).replace('_', ' ');

  return (
    <aside className="sidebar">
      <div
        className="sidebar-college"
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.5rem 1.25rem 1.25rem 1.25rem',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://i.ibb.co/8D6qf9gg/tl.png"
          alt="Logo"
          className="sidebar-logo"
          style={{ width: 58, height: 58, objectFit: 'contain', flexShrink: 0 }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="sidebar-college-text" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
          <strong className="col-name">B. K. Birla College, Kalyan</strong>
          <span className="col-status">(Empowered Autonomous Status)</span>
          <span className="col-dept">Management Studies</span>
        </div>
      </div>

      <nav id="sideNav">
        {menu.map((m, i) =>
          'isHeader' in m ? (
            <div className="nav-section" key={`h-${i}`}>
              {m.label}
            </div>
          ) : (
            <Link
              key={m.id}
              href={m.href}
              className={`nav-item${pathname === m.href ? ' active' : ''}`}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: m.icon }} />
              </span>
              <span>{m.label}</span>
            </Link>
          )
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="theme-row">
          <span className="theme-label">
            <span>
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </span>
            <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          </span>
          <label className="toggle-switch">
            <input type="checkbox" checked={theme === 'dark'} onChange={(e) => toggleTheme(e.target.checked)} />
            <span className="toggle-track" />
          </label>
        </div>
        <div className="user-pill">
          <div className="user-avatar">{initial}</div>
          <div className="user-info">
            <div className="user-name">{session.profile?.full_name || 'User'}</div>
            <div className="user-role">{roleLabel}</div>
          </div>
          <button className="btn-logout" title="Sign out" onClick={handleLogout}>
            <svg viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
