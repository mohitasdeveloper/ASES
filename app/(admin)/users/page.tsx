'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast, ToastContainer } from '@/components/Toast';
import './users.css';

const EDGE_FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-create-user`;

interface FacultyUser {
  id: string;
  supabase_uid: string | null;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  faculty_type: string;
  is_active: boolean;
  created_at: string;
}
interface AdminUser {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function UsersPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [tab, setTab] = useState<'faculty' | 'admin'>('faculty');
  const [facultyList, setFacultyList] = useState<FacultyUser[]>([]);
  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [loadingFaculty, setLoadingFaculty] = useState(true);
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fEmpCode, setFEmpCode] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fType, setFType] = useState('fulltime');
  const [fPhone, setFPhone] = useState('');
  const [fDept, setFDept] = useState('');
  const [fMsg, setFMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [fSaving, setFSaving] = useState(false);

  const [aName, setAName] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aRole, setARole] = useState('admin');
  const [aPassword, setAPassword] = useState('');
  const [aMsg, setAMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [aSaving, setASaving] = useState(false);

  const [facSearch, setFacSearch] = useState('');
  const [facFilter, setFacFilter] = useState('all');
  const [facSort, setFacSort] = useState('name_asc');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState('all');
  const [adminSort, setAdminSort] = useState('name_asc');

  const [editAdmin, setEditAdmin] = useState<AdminUser | null>(null);
  const [editAdminName, setEditAdminName] = useState('');
  const [editAdminRole, setEditAdminRole] = useState('admin');
  const [editFac, setEditFac] = useState<FacultyUser | null>(null);
  const [editFacName, setEditFacName] = useState('');
  const [editFacCode, setEditFacCode] = useState('');
  const [editFacPhone, setEditFacPhone] = useState('');
  const [editFacDept, setEditFacDept] = useState('');
  const [editFacType, setEditFacType] = useState('fulltime');

  const [resetPwTarget, setResetPwTarget] = useState<{ authUid: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [changeEmailTarget, setChangeEmailTarget] = useState<{ authUid: string; name: string; type: 'admin' | 'faculty' } | null>(null);
  const [newEmail, setNewEmail] = useState('');

  async function edgeCall(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'Request failed');
    }
    return res.json();
  }

  async function loadFaculty() {
    setLoadingFaculty(true);
    const { data, error } = await supabase.from('faculty').select('id, supabase_uid, employee_code, full_name, email, phone, department, faculty_type, is_active, created_at').order('full_name');
    if (error) toast(error.message, 'error');
    setFacultyList(data ?? []);
    setLoadingFaculty(false);
  }
  async function loadAdmins() {
    setLoadingAdmin(true);
    const { data, error } = await supabase.from('admin_users').select('id, full_name, role, is_active, created_at').order('created_at', { ascending: false });
    if (error) toast(error.message, 'error');
    setAdminList(data ?? []);
    setLoadingAdmin(false);
  }

  useEffect(() => {
    loadFaculty();
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateFaculty() {
    setFMsg(null);
    if (!fName.trim() || !fEmail.trim() || !fEmpCode.trim() || fPassword.length < 8) {
      setFMsg({ type: 'error', text: 'Please fill all required fields. Password must be at least 8 characters.' });
      return;
    }
    setFSaving(true);
    try {
      await edgeCall({ type: 'faculty', email: fEmail.trim(), password: fPassword, fullName: fName.trim(), employeeCode: fEmpCode.trim(), phone: fPhone.trim() || null, department: fDept.trim() || null, facultyType: fType });
      setFMsg({ type: 'success', text: 'Faculty account created successfully.' });
      setFName(''); setFEmail(''); setFEmpCode(''); setFPassword(''); setFPhone(''); setFDept(''); setFType('fulltime');
      await loadFaculty();
    } catch (e) {
      setFMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setFSaving(false);
    }
  }

  async function handleCreateAdmin() {
    setAMsg(null);
    if (!aName.trim() || !aEmail.trim() || aPassword.length < 8) {
      setAMsg({ type: 'error', text: 'Please fill all required fields. Password must be at least 8 characters.' });
      return;
    }
    setASaving(true);
    try {
      await edgeCall({ type: 'admin', email: aEmail.trim(), password: aPassword, fullName: aName.trim(), role: aRole });
      setAMsg({ type: 'success', text: 'Admin account created successfully.' });
      setAName(''); setAEmail(''); setAPassword(''); setARole('admin');
      await loadAdmins();
    } catch (e) {
      setAMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setASaving(false);
    }
  }

  async function toggleActive(userType: 'admin' | 'faculty', id: string, active: boolean) {
    const table = userType === 'admin' ? 'admin_users' : 'faculty';
    const { error } = await supabase.from(table).update({ is_active: !active }).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Account ${!active ? 'activated' : 'deactivated'}.`);
    if (userType === 'admin') loadAdmins();
    else loadFaculty();
  }

  function openEditAdmin(u: AdminUser) {
    setEditAdmin(u);
    setEditAdminName(u.full_name ?? '');
    setEditAdminRole(u.role);
  }
  async function saveAdminEdit() {
    if (!editAdmin) return;
    if (!editAdminName.trim()) { toast('Name is required.', 'error'); return; }
    try {
      const { error } = await supabase.from('admin_users').update({ full_name: editAdminName.trim(), role: editAdminRole }).eq('id', editAdmin.id);
      if (error) throw error;
      toast('Admin profile updated.');
      setEditAdmin(null);
      await loadAdmins();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function openEditFaculty(u: FacultyUser) {
    setEditFac(u);
    setEditFacName(u.full_name ?? '');
    setEditFacCode(u.employee_code ?? '');
    setEditFacPhone(u.phone ?? '');
    setEditFacDept(u.department ?? '');
    setEditFacType(u.faculty_type);
  }
  async function saveFacEdit() {
    if (!editFac) return;
    if (!editFacName.trim() || !editFacCode.trim()) { toast('Name and Code are required.', 'error'); return; }
    try {
      const { error } = await supabase.from('faculty').update({ full_name: editFacName.trim(), employee_code: editFacCode.trim(), phone: editFacPhone.trim() || null, department: editFacDept.trim() || null, faculty_type: editFacType }).eq('id', editFac.id);
      if (error) throw error;
      toast('Faculty profile updated.');
      setEditFac(null);
      await loadFaculty();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function openResetPw(authUid: string | null, name: string) {
    if (!authUid) { toast('Cannot reset: Auth UID missing for this user.', 'error'); return; }
    setResetPwTarget({ authUid, name });
    setNewPassword('');
  }
  async function confirmResetPw() {
    if (!resetPwTarget) return;
    if (newPassword.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
    try {
      await edgeCall({ action: 'reset_password', userId: resetPwTarget.authUid, password: newPassword });
      toast('Password reset successfully.');
      setResetPwTarget(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function openChangeEmail(authUid: string | null, name: string, type: 'admin' | 'faculty') {
    if (!authUid) { toast('Cannot update: Auth UID missing.', 'error'); return; }
    setChangeEmailTarget({ authUid, name, type });
    setNewEmail('');
  }
  async function confirmChangeEmail() {
    if (!changeEmailTarget) return;
    if (!newEmail.trim()) { toast('Please enter a new email.', 'error'); return; }
    try {
      await edgeCall({ action: 'change_email', userId: changeEmailTarget.authUid, email: newEmail.trim(), userType: changeEmailTarget.type });
      toast('Email updated successfully.');
      setChangeEmailTarget(null);
      if (changeEmailTarget.type === 'admin') loadAdmins();
      else loadFaculty();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const filteredFaculty = useMemo(() => {
    const q = facSearch.toLowerCase();
    let rows = facultyList.filter((f) => {
      if (q && !(f.full_name.toLowerCase().includes(q) || (f.employee_code || '').toLowerCase().includes(q))) return false;
      if (facFilter === 'active') return f.is_active;
      if (facFilter === 'inactive') return !f.is_active;
      if (facFilter === 'fulltime') return f.faculty_type === 'fulltime';
      if (facFilter === 'visiting') return f.faculty_type === 'visiting';
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (facSort === 'name_asc') return a.full_name.localeCompare(b.full_name);
      if (facSort === 'name_desc') return b.full_name.localeCompare(a.full_name);
      if (facSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });
    return rows;
  }, [facultyList, facSearch, facFilter, facSort]);

  const filteredAdmins = useMemo(() => {
    const q = adminSearch.toLowerCase();
    let rows = adminList.filter((a) => {
      if (q && !(a.full_name || '').toLowerCase().includes(q)) return false;
      if (adminFilter === 'active') return a.is_active;
      if (adminFilter === 'inactive') return !a.is_active;
      if (adminFilter === 'super_admin') return a.role === 'super_admin';
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (adminSort === 'name_asc') return (a.full_name || '').localeCompare(b.full_name || '');
      if (adminSort === 'name_desc') return (b.full_name || '').localeCompare(a.full_name || '');
      if (adminSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });
    return rows;
  }, [adminList, adminSearch, adminFilter, adminSort]);

  function exportCsv(type: 'faculty' | 'admin') {
    const rows = type === 'faculty' ? filteredFaculty : filteredAdmins;
    if (!rows.length) return toast('No data to export', 'warn');
    let headers: string[];
    let data: string[][];
    if (type === 'faculty') {
      headers = ['Name', 'Employee Code', 'Email', 'Type', 'Department', 'Status'];
      data = (rows as FacultyUser[]).map((f) => [f.full_name, f.employee_code, f.email ?? '', f.faculty_type, f.department ?? '', f.is_active ? 'Active' : 'Inactive']);
    } else {
      headers = ['Name', 'Role', 'Status', 'Created'];
      data = (rows as AdminUser[]).map((a) => [a.full_name ?? '', a.role, a.is_active ? 'Active' : 'Inactive', new Date(a.created_at).toLocaleDateString()]);
    }
    const csv = [headers.join(','), ...data.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${type === 'faculty' ? 'Faculty_List' : 'Admin_List'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <>
      <div className="topbar">
        <div><h1 className="page-title">User Management</h1><p className="page-subtitle">Create and manage admin and faculty accounts</p></div>
      </div>
      <div className="content">
        <div className="tabs">
          <button className={`tab${tab === 'faculty' ? ' active' : ''}`} onClick={() => setTab('faculty')}>Faculty Accounts</button>
          <button className={`tab${tab === 'admin' ? ' active' : ''}`} onClick={() => setTab('admin')}>Admin Accounts</button>
        </div>

        {tab === 'faculty' && (
          <div>
            <div className="card">
              <div className="card-title"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>Create Faculty Account</div>
              {fMsg && (
                <div className={`msg visible ${fMsg.type}`}>
                  <svg viewBox="0 0 24 24">{fMsg.type === 'error' ? <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></> : <polyline points="20,6 9,17 4,12" />}</svg>
                  <span>{fMsg.text}</span>
                </div>
              )}
              <div className="form-grid">
                <div className="field"><label>Full Name *</label><input type="text" placeholder="Dr. Anita Sharma" value={fName} onChange={(e) => setFName(e.target.value)} /></div>
                <div className="field"><label>Email Address *</label><input type="email" placeholder="faculty@college.edu" value={fEmail} onChange={(e) => setFEmail(e.target.value)} /></div>
                <div className="field"><label>Employee Code *</label><input type="text" placeholder="EMP001" value={fEmpCode} onChange={(e) => setFEmpCode(e.target.value)} /></div>
                <div className="field">
                  <label>Temporary Password *</label>
                  <div className="pw-wrap"><input type="password" placeholder="Min 8 characters" value={fPassword} onChange={(e) => setFPassword(e.target.value)} /></div>
                  <div className="field-hint">Faculty will change this after first login.</div>
                </div>
                <div className="field"><label>Faculty Type *</label><select value={fType} onChange={(e) => setFType(e.target.value)}><option value="fulltime">Full-Time</option><option value="visiting">Visiting</option></select></div>
                <div className="field"><label>Phone</label><input type="text" placeholder="+91 9876543210" value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></div>
                <div className="field"><label>Department</label><input type="text" placeholder="Commerce & Management" value={fDept} onChange={(e) => setFDept(e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button className="btn btn-primary" disabled={fSaving} onClick={handleCreateFaculty}>
                  <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {fSaving ? 'Creating…' : 'Create Faculty Account'}
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-title" style={{ padding: '1.5rem 1.5rem 0.5rem' }}><svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3" cy="6" r="1" /><circle cx="3" cy="12" r="1" /><circle cx="3" cy="18" r="1" /></svg>All Faculty</div>
              <div className="list-toolbar">
                <div className="toolbar-group">
                  <input type="text" className="toolbar-input" placeholder="Search name or code..." value={facSearch} onChange={(e) => setFacSearch(e.target.value)} />
                  <select className="toolbar-input" value={facFilter} onChange={(e) => setFacFilter(e.target.value)}>
                    <option value="all">All Status</option><option value="active">Active Only</option><option value="inactive">Inactive Only</option><option value="fulltime">Full-Time Only</option><option value="visiting">Visiting Only</option>
                  </select>
                  <select className="toolbar-input" value={facSort} onChange={(e) => setFacSort(e.target.value)}>
                    <option value="name_asc">Name (A-Z)</option><option value="name_desc">Name (Z-A)</option><option value="newest">Newest First</option>
                  </select>
                </div>
                <div className="toolbar-group">
                  <button className="btn-export" onClick={() => exportCsv('faculty')}>Export CSV</button>
                </div>
              </div>
              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead><tr><th>Name</th><th>Employee Code</th><th>Email</th><th>Type</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {loadingFaculty ? (
                      <tr className="empty-row"><td colSpan={7}><span className="spin" style={{ display: 'inline-block' }} /> Loading…</td></tr>
                    ) : filteredFaculty.length === 0 ? (
                      <tr className="empty-row"><td colSpan={7}>No faculty found.</td></tr>
                    ) : (
                      filteredFaculty.map((f) => (
                        <tr key={f.id}>
                          <td><strong>{f.full_name}</strong></td>
                          <td>{f.employee_code}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{f.email ?? '—'}</td>
                          <td>{f.faculty_type === 'fulltime' ? 'Full-Time' : 'Visiting'}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{f.department ?? '—'}</td>
                          <td><span className={`badge ${f.is_active ? 'badge-active' : 'badge-inactive'}`}>{f.is_active ? 'Active' : 'Inactive'}</span></td>
                          <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditFaculty(f)}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openResetPw(f.supabase_uid, f.full_name)}>Reset PW</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openChangeEmail(f.supabase_uid, f.full_name, 'faculty')}>Email</button>
                            <button className={`btn btn-sm ${f.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive('faculty', f.id, f.is_active)}>{f.is_active ? 'Deactivate' : 'Activate'}</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'admin' && (
          <div>
            <div className="card">
              <div className="card-title"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>Create Admin Account</div>
              {aMsg && (
                <div className={`msg visible ${aMsg.type}`}>
                  <svg viewBox="0 0 24 24">{aMsg.type === 'error' ? <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></> : <polyline points="20,6 9,17 4,12" />}</svg>
                  <span>{aMsg.text}</span>
                </div>
              )}
              <div className="form-grid">
                <div className="field"><label>Full Name *</label><input type="text" placeholder="Admin Name" value={aName} onChange={(e) => setAName(e.target.value)} /></div>
                <div className="field"><label>Email Address *</label><input type="email" placeholder="admin@college.edu" value={aEmail} onChange={(e) => setAEmail(e.target.value)} /></div>
                <div className="field"><label>Role *</label><select value={aRole} onChange={(e) => setARole(e.target.value)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></div>
                <div className="field"><label>Temporary Password *</label><div className="pw-wrap"><input type="password" placeholder="Min 8 characters" value={aPassword} onChange={(e) => setAPassword(e.target.value)} /></div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button className="btn btn-primary" disabled={aSaving} onClick={handleCreateAdmin}>
                  <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {aSaving ? 'Creating…' : 'Create Admin Account'}
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-title" style={{ padding: '1.5rem 1.5rem 0.5rem' }}><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>All Admins</div>
              <div className="list-toolbar">
                <div className="toolbar-group">
                  <input type="text" className="toolbar-input" placeholder="Search name..." value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} />
                  <select className="toolbar-input" value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)}>
                    <option value="all">All Status</option><option value="active">Active Only</option><option value="inactive">Inactive Only</option><option value="super_admin">Super Admins Only</option>
                  </select>
                  <select className="toolbar-input" value={adminSort} onChange={(e) => setAdminSort(e.target.value)}>
                    <option value="name_asc">Name (A-Z)</option><option value="name_desc">Name (Z-A)</option><option value="newest">Newest First</option>
                  </select>
                </div>
                <div className="toolbar-group">
                  <button className="btn-export" onClick={() => exportCsv('admin')}>Export CSV</button>
                </div>
              </div>
              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {loadingAdmin ? (
                      <tr className="empty-row"><td colSpan={5}><span className="spin" style={{ display: 'inline-block' }} /> Loading…</td></tr>
                    ) : filteredAdmins.length === 0 ? (
                      <tr className="empty-row"><td colSpan={5}>No admins found.</td></tr>
                    ) : (
                      filteredAdmins.map((a) => (
                        <tr key={a.id}>
                          <td><strong>{a.full_name ?? '—'}</strong></td>
                          <td style={{ textTransform: 'capitalize' }}>{a.role.replace('_', ' ')}</td>
                          <td><span className={`badge ${a.is_active ? 'badge-active' : 'badge-inactive'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                          <td style={{ color: 'var(--text-muted)' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                          <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditAdmin(a)}>Edit</button>
                            <button className={`btn btn-sm ${a.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive('admin', a.id, a.is_active)}>{a.is_active ? 'Deactivate' : 'Activate'}</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`modal-back${editAdmin ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-title" style={{ padding: '1.25rem 1.5rem 0' }}>Edit Admin Profile</div>
          <div className="modal-body">
            <div className="field"><label>Full Name</label><input type="text" value={editAdminName} onChange={(e) => setEditAdminName(e.target.value)} /></div>
            <div className="field" style={{ marginTop: '0.75rem' }}><label>Role</label><select value={editAdminRole} onChange={(e) => setEditAdminRole(e.target.value)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setEditAdmin(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAdminEdit}>Save</button>
          </div>
        </div>
      </div>

      <div className={`modal-back${editFac ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 450 }}>
          <div className="modal-title" style={{ padding: '1.25rem 1.5rem 0' }}>Edit Faculty Profile</div>
          <div className="modal-body form-grid">
            <div className="field"><label>Full Name</label><input type="text" value={editFacName} onChange={(e) => setEditFacName(e.target.value)} /></div>
            <div className="field"><label>Employee Code</label><input type="text" value={editFacCode} onChange={(e) => setEditFacCode(e.target.value)} /></div>
            <div className="field"><label>Phone</label><input type="text" value={editFacPhone} onChange={(e) => setEditFacPhone(e.target.value)} /></div>
            <div className="field"><label>Department</label><input type="text" value={editFacDept} onChange={(e) => setEditFacDept(e.target.value)} /></div>
            <div className="field" style={{ gridColumn: 'span 2' }}><label>Faculty Type</label><select value={editFacType} onChange={(e) => setEditFacType(e.target.value)}><option value="fulltime">Full-Time</option><option value="visiting">Visiting</option></select></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setEditFac(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveFacEdit}>Save</button>
          </div>
        </div>
      </div>

      <div className={`modal-back${resetPwTarget ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-title" style={{ padding: '1.25rem 1.5rem 0' }}>Reset Password</div>
          <div className="modal-body">
            <div className="field"><label>New Password for <strong>{resetPwTarget?.name}</strong></label><input type="text" placeholder="Min 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setResetPwTarget(null)}>Cancel</button>
            <button className="btn btn-warn" onClick={confirmResetPw}>Force Reset</button>
          </div>
        </div>
      </div>

      <div className={`modal-back${changeEmailTarget ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-title" style={{ padding: '1.25rem 1.5rem 0' }}>Change Email Address</div>
          <div className="modal-body">
            <div className="field"><label>New Email for <strong>{changeEmailTarget?.name}</strong></label><input type="email" placeholder="new.email@college.edu" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setChangeEmailTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmChangeEmail}>Update Email</button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
