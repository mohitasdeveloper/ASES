'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import './faculty-portal.css';

const STATUS_LABELS: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };
const LEAVE_LABELS: Record<string, string> = { casual: 'Casual Leave', medical: 'Medical Leave', earned: 'Earned Leave', duty: 'Duty Leave', half_day_morning: 'Half Day (AM)', half_day_afternoon: 'Half Day (PM)', compensatory: 'Compensatory Leave', other: 'Other' };

interface Lecture {
  id: string;
  is_cancelled: boolean;
  time_slot: { start_time: string; end_time: string; slot_label: string | null; slot_type: string; sort_order: number } | null;
  room: { room_code: string } | null;
  course: { year: string; program: string; division: string | null } | null;
  subject: { subject_name: string } | null;
}
interface ExecRow {
  schedule_date: string;
  faculty_status: string;
  daily_schedule: { subject: { subject_name: string } | null } | null;
}
interface LeaveRow {
  leave_date: string;
  leave_type: string;
  status: string;
}

function courseName(c: Lecture['course']) {
  if (!c) return 'Unknown Course';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}
function statusBg(status: string) {
  if (status === 'on_time') return 'bg-green';
  if (status === 'late') return 'bg-amber';
  if (status === 'not_engaged') return 'bg-red';
  return 'bg-gray';
}
function leaveBg(status: string) {
  if (status === 'approved') return 'bg-green';
  if (status === 'rejected') return 'bg-red';
  if (status === 'pending') return 'bg-amber';
  return 'bg-gray';
}

export default function FacultyPortalPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(false);
  const [noProfile, setNoProfile] = useState(false);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  const [facultyName, setFacultyName] = useState('Professor');
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [execs, setExecs] = useState<ExecRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const displayDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        let facultyId: string | null = null;
        let fName = 'Professor';
        let adminPreview = false;

        const { data: facMatch } = await supabase.from('faculty').select('id, full_name').eq('supabase_uid', user.id).maybeSingle();
        if (facMatch) {
          facultyId = facMatch.id;
          fName = facMatch.full_name;
        }

        if (!facultyId) {
          const { data: adminMatch } = await supabase.from('admin_users').select('role').eq('id', user.id).maybeSingle();
          if (adminMatch && (adminMatch.role === 'admin' || adminMatch.role === 'super_admin')) {
            const { data: firstFac } = await supabase.from('faculty').select('id, full_name').limit(1).maybeSingle();
            if (firstFac) {
              facultyId = firstFac.id;
              fName = firstFac.full_name;
              adminPreview = true;
            }
          }
        }

        if (!facultyId) {
          setNoProfile(true);
          setLoading(false);
          return;
        }

        setFacultyName(fName);
        setIsAdminPreview(adminPreview);

        const { data: scheduleData, error: sErr } = await supabase
          .from('daily_schedule')
          .select(
            `id, schedule_date, is_cancelled,
             time_slot:time_slot_id(start_time, end_time, slot_label, slot_type, sort_order),
             room:room_id(room_code), course:course_id(year, program, division), subject:subject_id(subject_name)`
          )
          .eq('assigned_faculty_id', facultyId)
          .eq('schedule_date', todayStr);
        if (sErr) throw sErr;

        const lecturesToday = ((scheduleData as unknown as Lecture[]) || []).filter((s) => s.time_slot?.slot_type === 'lecture');
        lecturesToday.sort((a, b) => (a.time_slot?.sort_order || 0) - (b.time_slot?.sort_order || 0));
        setLectures(lecturesToday);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: myExecsRaw } = await supabase
          .from('lecture_execution')
          .select('schedule_date, faculty_status, daily_schedule!inner(assigned_faculty_id, subject:subject_id(subject_name))')
          .eq('daily_schedule.assigned_faculty_id', facultyId)
          .gte('schedule_date', thirtyDaysAgo.toLocaleDateString('en-CA'))
          .order('schedule_date', { ascending: false })
          .limit(10);
        setExecs((myExecsRaw as unknown as ExecRow[]) || []);

        const { data: myLeaves } = await supabase.from('faculty_leaves').select('leave_date, leave_type, status').eq('faculty_id', facultyId).order('leave_date', { ascending: false }).limit(10);
        setLeaves(myLeaves ?? []);
      } catch (e) {
        console.error(e);
        setErrorState(true);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeLecturesCount = lectures.filter((l) => !l.is_cancelled).length;
  const lateCount = execs.filter((e) => e.faculty_status === 'late').length;
  const approvedLeavesCount = leaves.filter((l) => l.status === 'approved').length;

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">My Portal</h1>
          <p className="page-subtitle">View your daily schedule and execution history</p>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}><span className="spin" /></div>
        ) : noProfile ? (
          <div className="error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <h2>No Faculty Profile Linked</h2>
            <p>Your user account is not linked to a Faculty profile in the system. Contact your administrator to ensure your Auth ID is mapped to your Faculty record.</p>
          </div>
        ) : errorState ? (
          <div className="error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <h2>Error Loading Portal</h2>
            <p>We encountered an issue fetching your data. Please check your console for details, or contact support.</p>
          </div>
        ) : (
          <>
            <div className="portal-top">
              <div className="welcome-display">
                <div className="welcome-title">Welcome back, {facultyName.split(' ')[0]}</div>
                <div className="welcome-subtitle">
                  {isAdminPreview ? <><span style={{ color: 'var(--error)', fontWeight: 'bold' }}>[ADMIN PREVIEW]</span> Viewing as {facultyName}</> : 'Here is your professional summary for today.'}
                </div>
              </div>
              <div className="date-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                {displayDate}
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card blue"><div className="stat-label">Scheduled Today</div><div className="stat-value">{activeLecturesCount}</div><div className="stat-desc">active lecture slots</div></div>
              <div className="stat-card yellow"><div className="stat-label">Late Marks (Recent)</div><div className="stat-value">{lateCount}</div><div className="stat-desc">in the last 10 records</div></div>
              <div className="stat-card green"><div className="stat-label">Leaves Taken</div><div className="stat-value">{approvedLeavesCount}</div><div className="stat-desc">approved records found</div></div>
            </div>

            <div className="portal-grid">
              <div className="panel-card">
                <div className="panel-header">
                  <div className="panel-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>Today&apos;s Schedule</div>
                </div>
                <div className="timeline">
                  {lectures.length === 0 ? (
                    <div className="timeline-empty">You have no lectures scheduled for today.<br />Enjoy your day!</div>
                  ) : (
                    lectures.map((lec) => {
                      const t = lec.time_slot!;
                      const sTime = t.start_time.slice(0, 5);
                      const eTime = t.end_time.slice(0, 5);
                      const rCode = lec.room?.room_code || 'TBA';
                      const sName = lec.subject?.subject_name || 'Unknown Subject';
                      return (
                        <div className="tl-item" key={lec.id}>
                          <div className="tl-time"><strong>{sTime}</strong><span>{eTime}</span></div>
                          <div className={`tl-dot${lec.is_cancelled ? ' cancelled' : ''}`} />
                          <div className={`tl-content${lec.is_cancelled ? ' cancelled' : ''}`}>
                            <div className="tl-course">{lec.is_cancelled ? 'CANCELLED' : courseName(lec.course)}</div>
                            <div className="tl-subject">{sName}</div>
                            <div className="tl-room">
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                              Room {rCode}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="panel-card" style={{ flex: 1 }}>
                  <div className="panel-header">
                    <div className="panel-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>Recent Executions</div>
                  </div>
                  <ul className="history-list">
                    {execs.length === 0 ? (
                      <li className="hl-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No recent executions recorded.</li>
                    ) : (
                      execs.map((ex, i) => (
                        <li className="hl-item" key={i}>
                          <div className="hl-main">
                            <span className="hl-title">{ex.daily_schedule?.subject?.subject_name || 'Subject'}</span>
                            <span className="hl-date">{new Date(ex.schedule_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <span className={`hl-badge ${statusBg(ex.faculty_status)}`}>{STATUS_LABELS[ex.faculty_status] || 'Unknown'}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className="panel-card" style={{ flex: 1 }}>
                  <div className="panel-header">
                    <div className="panel-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>Leave Status</div>
                  </div>
                  <ul className="history-list">
                    {leaves.length === 0 ? (
                      <li className="hl-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No leave history found.</li>
                    ) : (
                      leaves.map((lv, i) => (
                        <li className="hl-item" key={i}>
                          <div className="hl-main">
                            <span className="hl-title">{LEAVE_LABELS[lv.leave_type] || lv.leave_type.toUpperCase()}</span>
                            <span className="hl-date">{new Date(lv.leave_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <span className={`hl-badge ${leaveBg(lv.status)}`}>{lv.status.toUpperCase()}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
