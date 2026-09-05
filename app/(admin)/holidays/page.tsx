'use client';

import { useEffect, useRef, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';
import { useToast, ToastContainer } from '@/components/Toast';
import './holidays.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}
function dayName(d: string) {
  return DAY_NAMES[new Date(d + 'T00:00:00').getDay()];
}

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
}

export default function HolidaysPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) setUserId(data.user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!dateInputRef.current) return;
    const fp = flatpickr(dateInputRef.current, { dateFormat: 'Y-m-d', disableMobile: true, onChange: ([d]) => setHolidayDate(d ? d.toISOString().slice(0, 10) : '') });
    return () => fp.destroy();
  }, []);

  async function loadHolidays() {
    try {
      const { data, error } = await supabase.from('holidays').select('id, holiday_date, name').order('holiday_date', { ascending: true });
      if (error) throw error;
      setHolidays(data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  useEffect(() => {
    loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeclare() {
    if (!holidayDate || !holidayName.trim()) { toast('Date and name are required.', 'error'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('holidays').insert({ holiday_date: holidayDate, name: holidayName.trim(), declared_by: userId });
      if (error) {
        if (error.code === '23505') toast(`${fmtDate(holidayDate)} is already declared as a holiday.`, 'warn');
        else throw error;
        return;
      }
      toast(`${holidayName.trim()} (${fmtDate(holidayDate)}) declared as holiday.`, 'success');
      setHolidayDate('');
      setHolidayName('');
      if (dateInputRef.current) dateInputRef.current.value = '';
      await loadHolidays();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('holidays').delete().eq('id', pendingDelete.id);
      if (error) throw error;
      toast('Holiday removed.', 'success');
      setPendingDelete(null);
      await loadHolidays();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Holidays</h1>
          <p className="page-subtitle">Declare college holidays — affects Daily Scheduler and Execution Log</p>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            Declare Holiday
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>Holiday Date <span style={{ color: 'var(--error)' }}>*</span></label>
              <input ref={dateInputRef} type="text" placeholder="Pick a date" readOnly />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Holiday Name <span style={{ color: 'var(--error)' }}>*</span></label>
              <input type="text" placeholder="e.g. Diwali, Republic Day, Exam…" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" disabled={saving} onClick={handleDeclare}>
                <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: '#fff', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Declare Holiday
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Declared Holidays
            <span style={{ fontSize: '.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '.5rem' }}>{holidays ? `(${holidays.length})` : ''}</span>
          </div>
          {holidays === null ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '.84rem', padding: '.5rem 0' }}><span className="spin" style={{ display: 'inline-block' }} /> Loading…</div>
          ) : holidays.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '.84rem', padding: '1rem 0' }}>No holidays declared yet.</div>
          ) : (
            <div className="holiday-grid">
              {holidays.map((h) => (
                <div className="holiday-card" key={h.id}>
                  <div className="holiday-info">
                    <div className="holiday-date">{fmtDate(h.holiday_date)}</div>
                    <div className="holiday-day">{dayName(h.holiday_date)}</div>
                    <div className="holiday-name">{h.name}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete(h)}>
                    <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><polyline points="3,6 5,6 21,6" /><path d="M19 6l-1 14H6L5 6" /></svg>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`modal-back${pendingDelete ? ' open' : ''}`}>
        <div className="modal">
          <div className="modal-title">Remove Holiday?</div>
          <div className="modal-body-text">
            {pendingDelete && `Remove "${pendingDelete.name}" (${fmtDate(pendingDelete.holiday_date)}) from holidays? This cannot be undone.`}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" disabled={deleting} onClick={confirmDelete}>Remove</button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
