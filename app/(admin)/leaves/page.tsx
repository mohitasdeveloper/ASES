'use client';

import { useEffect, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';
import { useToast, ToastContainer } from '@/components/Toast';
import TomSelectField from '@/components/TomSelectField';
import '../list-page.css';

const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual Leave' },
  { value: 'medical', label: 'Medical Leave' },
  { value: 'earned', label: 'Earned Leave' },
  { value: 'duty', label: 'Duty Leave' },
  { value: 'half_day_morning', label: 'Half Day (Morning)' },
  { value: 'half_day_afternoon', label: 'Half Day (Afternoon)' },
  { value: 'compensatory', label: 'Compensatory Leave' },
  { value: 'other', label: 'Other' },
];
const HALF_TYPES = new Set(['half_day_morning', 'half_day_afternoon']);
function leaveTypeLabel(val: string) {
  return LEAVE_TYPES.find((t) => t.value === val)?.label ?? val;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface LeaveRow {
  id: string;
  leave_date: string;
  leave_type: string;
  reason: string | null;
  status: string;
  faculty: { id: string; full_name: string } | null;
  entered_by_profile: { full_name: string } | null;
}

export default function LeavesPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [faculty, setFaculty] = useState<{ id: string; full_name: string }[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [quickFacultyId, setQuickFacultyId] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const [leaveFacultyId, setLeaveFacultyId] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [filterFacultyId, setFilterFacultyId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; date: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) setUserId(authData.user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    const leaveEl = document.getElementById('leaveDatePicker');
    const fromEl = document.getElementById('filterFrom');
    const toEl = document.getElementById('filterTo');
    const fpLeave = leaveEl ? flatpickr(leaveEl, { dateFormat: 'Y-m-d', disableMobile: true, onChange: ([d]) => setLeaveDate(d ? d.toISOString().slice(0, 10) : '') }) : null;
    const fpFrom = fromEl ? flatpickr(fromEl, { dateFormat: 'Y-m-d', disableMobile: true, onChange: ([d]) => setFilterFrom(d ? d.toISOString().slice(0, 10) : '') }) : null;
    const fpTo = toEl ? flatpickr(toEl, { dateFormat: 'Y-m-d', disableMobile: true, onChange: ([d]) => setFilterTo(d ? d.toISOString().slice(0, 10) : '') }) : null;
    return () => { fpLeave?.destroy(); fpFrom?.destroy(); fpTo?.destroy(); };
  }, []);

  async function loadFaculty() {
    setDropdownsLoading(true);
    const { data } = await supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name');
    setFaculty(data ?? []);
    setDropdownsLoading(false);
  }

  async function loadLeaves(fromDate?: string, toDate?: string, facultyId?: string) {
    setLoading(true);
    try {
      let q = supabase
        .from('faculty_leaves')
        .select('id, leave_date, leave_type, reason, status, faculty:faculty!faculty_id(id, full_name), entered_by_profile:admin_users!entered_by(full_name)')
        .order('leave_date', { ascending: false });
      if (fromDate) q = q.gte('leave_date', fromDate);
      if (toDate) q = q.lte('leave_date', toDate);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data as unknown as LeaveRow[]) ?? [];
      if (facultyId) rows = rows.filter((l) => l.faculty?.id === facultyId);
      setLeaves(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFaculty();
    loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleQuickAbsent() {
    if (!quickFacultyId) { toast('Please select a faculty member.', 'error'); return; }
    setQuickSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('faculty_leaves').upsert(
        { faculty_id: quickFacultyId, leave_date: today, leave_type: 'other', reason: 'Walk-in absence', status: 'approved', entered_by: userId },
        { onConflict: 'faculty_id,leave_date' }
      );
      if (error) throw error;
      const name = faculty.find((f) => f.id === quickFacultyId)?.full_name ?? quickFacultyId;
      toast(`${name} marked absent for today.`, 'success');
      setQuickFacultyId('');
      await loadLeaves();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setQuickSaving(false);
    }
  }

  async function handleSaveLeave() {
    if (!leaveFacultyId || !leaveDate || !leaveType) { toast('Please fill in all required fields.', 'error'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('faculty_leaves').upsert(
        { faculty_id: leaveFacultyId, leave_date: leaveDate, leave_type: leaveType, reason: leaveReason.trim() || null, status: 'approved', entered_by: userId },
        { onConflict: 'faculty_id,leave_date' }
      );
      if (error) throw error;
      toast('Leave record saved.', 'success');
      setLeaveFacultyId('');
      setLeaveDate('');
      setLeaveType('');
      setLeaveReason('');
      (document.getElementById('leaveDatePicker') as HTMLInputElement).value = '';
      await loadLeaves();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function applyFilter() {
    loadLeaves(filterFrom || undefined, filterTo || undefined, filterFacultyId || undefined);
  }
  function clearFilter() {
    setFilterFacultyId('');
    setFilterFrom('');
    setFilterTo('');
    (document.getElementById('filterFrom') as HTMLInputElement).value = '';
    (document.getElementById('filterTo') as HTMLInputElement).value = '';
    loadLeaves();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('faculty_leaves').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast('Leave record deleted.', 'success');
      setDeleteTarget(null);
      await loadLeaves();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const facultyOptions = faculty.map((f) => ({ value: f.id, label: f.full_name }));

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">Record and manage faculty leave — admin entry only</p>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            Quick Mark — Absent Today
          </div>
          <div className="quick-bar">
            <div className="field">
              <label>Faculty Member</label>
              {!dropdownsLoading && <TomSelectField options={facultyOptions} value={quickFacultyId} onChange={setQuickFacultyId} placeholder="Search faculty…" allowEmptyOption />}
            </div>
            <button className="btn btn-warn" style={{ flexShrink: 0 }} disabled={quickSaving} onClick={handleQuickAbsent}>
              <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              Mark Absent Today
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            Add Leave Record
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Faculty Member *</label>
              {!dropdownsLoading && <TomSelectField options={facultyOptions} value={leaveFacultyId} onChange={setLeaveFacultyId} placeholder="Search faculty…" allowEmptyOption />}
            </div>
            <div className="field">
              <label>Leave Date *</label>
              <input type="text" id="leaveDatePicker" placeholder="Pick a date" readOnly />
            </div>
            <div className="field">
              <label>Leave Type *</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                <option value="">— select type —</option>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Reason <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <textarea placeholder="Add a note if needed…" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button className="btn btn-primary" disabled={saving} onClick={handleSaveLeave}>
              <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17,21 17,13 7,13 7,21" /><polyline points="7,3 7,8 15,8" /></svg>
              Save Leave Record
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-title" style={{ padding: '1.5rem 1.5rem 0' }}>
            <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            Leave Records
          </div>
          <div className="filters" style={{ padding: '0 1.5rem' }}>
            <div className="field">
              <label>Filter by Faculty</label>
              {!dropdownsLoading && <TomSelectField options={facultyOptions} value={filterFacultyId} onChange={setFilterFacultyId} placeholder="All Faculty" allowEmptyOption />}
            </div>
            <div className="field"><label>From Date</label><input type="text" id="filterFrom" placeholder="From date" readOnly /></div>
            <div className="field"><label>To Date</label><input type="text" id="filterTo" placeholder="To date" readOnly /></div>
            <button className="btn btn-primary btn-sm" onClick={applyFilter}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>Apply
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearFilter}>Clear</button>
          </div>

          <div className="table-wrap" style={{ border: 'none', borderRadius: 0, marginTop: '1rem' }}>
            <table>
              <thead>
                <tr><th>Faculty Name</th><th>Date</th><th>Leave Type</th><th>Reason</th><th>Entered By</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="empty-row"><td colSpan={7}><span className="spin" style={{ display: 'inline-block' }} /> Loading records…</td></tr>
                ) : leaves.length === 0 ? (
                  <tr className="empty-row"><td colSpan={7}>No leave records found.</td></tr>
                ) : (
                  leaves.map((l) => (
                    <tr key={l.id}>
                      <td><strong style={{ color: 'var(--text-primary)' }}>{l.faculty?.full_name ?? '—'}</strong></td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatDate(l.leave_date)}</td>
                      <td><span className={`badge ${HALF_TYPES.has(l.leave_type) ? 'badge-halfday' : 'badge-type'}`}>{leaveTypeLabel(l.leave_type)}</span></td>
                      <td style={{ maxWidth: 200, color: 'var(--text-muted)' }}>{l.reason ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{l.entered_by_profile?.full_name ?? '—'}</td>
                      <td><span className={`badge ${l.status === 'approved' ? 'badge-approved' : 'badge-rejected'}`}>{l.status}</span></td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ id: l.id, name: l.faculty?.full_name ?? '', date: l.leave_date })}>
                          <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`modal-back${deleteTarget ? ' open' : ''}`}>
        <div className="modal">
          <div className="modal-title">Delete Leave Record?</div>
          <div className="modal-body" style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {deleteTarget && `Delete leave record for ${deleteTarget.name} on ${formatDate(deleteTarget.date)}? This cannot be undone.`}
          </div>
          <div className="modal-footer" style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
