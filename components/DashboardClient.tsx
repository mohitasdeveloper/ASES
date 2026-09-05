'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';

const STATUS_LABELS: Record<string, string> = {
  on_time: 'On Time',
  late: 'Late',
  not_engaged: 'Not Engaged',
  not_marked: 'Not Marked',
};

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function timeAgo(dateString: string) {
  const d = new Date(dateString);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

interface LeaveEntry {
  created_at: string;
  leave_type: string;
  faculty: { full_name: string } | null;
}
interface ExecEntry {
  updated_at: string;
  faculty_status: string;
  daily_schedule: {
    subject: { subject_name: string } | null;
    faculty: { full_name: string } | null;
  } | null;
}

function useAnimatedValue(value: number) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const end = value;
    if (start === end) return;
    const duration = 500;
    let startTs: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min((ts - startTs) / duration, 1);
      setDisplay(Math.floor(progress * (end - start) + start));
      if (progress < 1) raf = requestAnimationFrame(step);
      else prev.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

export default function DashboardClient() {
  const supabase = createClient();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [dateStr, setDateStr] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [stats, setStats] = useState({ scheduled: 0, marked: 0, unmarked: 0, absent: 0, notEngaged: 0 });
  const [leaves, setLeaves] = useState<LeaveEntry[] | null>(null);
  const [execs, setExecs] = useState<ExecEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!dateInputRef.current) return;
    const fp = flatpickr(dateInputRef.current, {
      defaultDate: 'today',
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onChange: (_dates, str) => setDateStr(str),
    });
    return () => fp.destroy();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(false);
      setLeaves(null);
      setExecs(null);

      try {
        const { count: schedCount, error: sErr } = await supabase
          .from('daily_schedule')
          .select('*', { count: 'exact', head: true })
          .eq('schedule_date', dateStr)
          .eq('is_cancelled', false);
        if (sErr) throw sErr;

        const { data: executions, error: eErr } = await supabase
          .from('lecture_execution')
          .select('faculty_status')
          .eq('schedule_date', dateStr);
        if (eErr) throw eErr;

        const { count: leaveCount, error: lErr } = await supabase
          .from('faculty_leaves')
          .select('*', { count: 'exact', head: true })
          .eq('leave_date', dateStr)
          .eq('status', 'approved');
        if (lErr) throw lErr;

        if (cancelled) return;

        const scheduled = schedCount || 0;
        const actuallyMarked = executions ? executions.filter((e) => e.faculty_status !== 'not_marked') : [];
        const marked = actuallyMarked.length;
        const notEngaged = actuallyMarked.filter((e) => e.faculty_status === 'not_engaged').length;
        const unmarked = Math.max(0, scheduled - marked);

        setStats({ scheduled, marked, unmarked, absent: leaveCount || 0, notEngaged });

        const { data: leavesData, error: llErr } = await supabase
          .from('faculty_leaves')
          .select('created_at, leave_type, faculty:faculty_id(full_name)')
          .eq('leave_date', dateStr)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(6);
        if (llErr) throw llErr;
        if (!cancelled) setLeaves((leavesData as unknown as LeaveEntry[]) || []);

        const { data: execData, error: eeErr } = await supabase
          .from('lecture_execution')
          .select(
            `updated_at, faculty_status,
             daily_schedule:daily_schedule_id(
               subject:subject_id(subject_name),
               faculty:assigned_faculty_id(full_name)
             )`
          )
          .eq('schedule_date', dateStr)
          .neq('faculty_status', 'not_marked')
          .order('updated_at', { ascending: false })
          .limit(6);
        if (eeErr) throw eeErr;
        if (!cancelled) setExecs((execData as unknown as ExecEntry[]) || []);
      } catch (err) {
        console.error('Dashboard error:', err);
        if (!cancelled) setLoadError(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateStr, supabase]);

  const dayOfWeek = new Date(dateStr).getDay();
  const dayType = dayOfWeek === 0 ? 'Sunday' : dayOfWeek === 6 ? 'Saturday' : 'Weekday';

  const aSched = useAnimatedValue(stats.scheduled);
  const aMarked = useAnimatedValue(stats.marked);
  const aUnmarked = useAnimatedValue(stats.unmarked);
  const aAbsent = useAnimatedValue(stats.absent);
  const aNotEngaged = useAnimatedValue(stats.notEngaged);

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Academic Schedule Execution System — Admin Overview</p>
        </div>
      </div>

      <div className="content">
        <div className="dashboard-top">
          <div className="date-display">
            <div className="date-title">{formatDisplayDate(dateStr)}</div>
            <div className="date-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{dayType}</span>
            </div>
          </div>
          <div className="date-picker-wrapper">
            <span className="date-picker-icon">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <input ref={dateInputRef} type="text" className="date-picker-input" placeholder="Select Date" readOnly />
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-label">Scheduled Today</div>
            <div className="stat-value">{aSched}</div>
            <div className="stat-desc">lecture slots</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Marked</div>
            <div className="stat-value">{aMarked}</div>
            <div className="stat-desc">execution records</div>
          </div>
          <div className="stat-card gray">
            <div className="stat-label">Pending / Unmarked</div>
            <div className="stat-value">{aUnmarked}</div>
            <div className="stat-desc">not yet marked</div>
          </div>
          <div className="stat-card yellow">
            <div className="stat-label">Absent Faculty</div>
            <div className="stat-value">{aAbsent}</div>
            <div className="stat-desc">today</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Not Engaged</div>
            <div className="stat-value">{aNotEngaged}</div>
            <div className="stat-desc">today</div>
          </div>
        </div>

        <div className="quick-links">
          <Link href="/leaves" className="quick-link">
            <div className="quick-icon">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div className="quick-text"><span className="quick-title">Leave Management</span><span className="quick-desc">Record absences &amp; leaves</span></div>
          </Link>
          <Link href="/daily-scheduler" className="quick-link">
            <div className="quick-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div className="quick-text"><span className="quick-title">Daily Scheduler</span><span className="quick-desc">Generate today&apos;s schedule</span></div>
          </Link>
          <Link href="/execution" className="quick-link">
            <div className="quick-icon">
              <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div className="quick-text"><span className="quick-title">Execution Log</span><span className="quick-desc">Mark lecture outcomes</span></div>
          </Link>
          <Link href="/reports" className="quick-link">
            <div className="quick-icon">
              <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div className="quick-text"><span className="quick-title">Reports</span><span className="quick-desc">View &amp; export all reports</span></div>
          </Link>
        </div>

        <div className="lists-grid">
          <div className="list-card">
            <div className="list-header">
              <div className="list-title">Leave Entries (Selected Date)</div>
              <Link href="/leaves" className="list-link">View all &rarr;</Link>
            </div>
            <ul className="list-body">
              {leaves === null ? (
                <div className="list-empty"><span className="spin" /> Loading...</div>
              ) : loadError ? (
                <div className="list-empty">Error loading leaves.</div>
              ) : leaves.length === 0 ? (
                <div className="list-empty">No approved leaves for this date.</div>
              ) : (
                leaves.map((l, i) => (
                  <li className="list-item" key={i}>
                    <div className="item-content">
                      <div className="item-title">Prof. {l.faculty?.full_name || 'Unknown'}</div>
                      <div className="item-subtitle">{(l.leave_type || 'Leave').toUpperCase()}</div>
                    </div>
                    <div className="item-meta">{timeAgo(l.created_at)}</div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="list-card">
            <div className="list-header">
              <div className="list-title">Execution Updates (Selected Date)</div>
              <Link href="/execution" className="list-link">View all &rarr;</Link>
            </div>
            <ul className="list-body">
              {execs === null ? (
                <div className="list-empty"><span className="spin" /> Loading...</div>
              ) : loadError ? (
                <div className="list-empty">Error loading executions.</div>
              ) : execs.length === 0 ? (
                <div className="list-empty">No execution updates recorded yet for this date.</div>
              ) : (
                execs.map((e, i) => {
                  const facName = e.daily_schedule?.faculty?.full_name || 'Unknown Faculty';
                  const subName = e.daily_schedule?.subject?.subject_name || 'Unknown Subject';
                  const statusLbl = STATUS_LABELS[e.faculty_status] || 'Not Marked';
                  const rawDate = new Date(e.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                  return (
                    <li className="list-item" key={i}>
                      <div className="item-content">
                        <div className="item-title">
                          <span className={`dot dot-${e.faculty_status}`} />
                          Prof. {facName} &mdash; {subName}
                        </div>
                        <div className="item-subtitle">{rawDate} &middot; {statusLbl}</div>
                      </div>
                      <div className="item-meta">{timeAgo(e.updated_at)}</div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
