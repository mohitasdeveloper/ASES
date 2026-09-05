'use client';

import { useEffect, useMemo, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, exportToPDF, preloadLogoForPDF, type ExportColumn } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import TomSelectField from '@/components/TomSelectField';
import TomSelectMulti from '@/components/TomSelectMulti';
import './reports.css';

const STATUS_LABELS: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function courseLbl(c: any) {
  if (!c) return '—';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : '—';
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flagsOf(r: any) {
  const flags: string[] = [];
  if (r.is_replaced) flags.push('Replaced');
  if (r.is_time_changed) flags.push('Time Δ');
  if (r.is_room_changed) flags.push('Room Δ');
  return flags;
}

const EXEC_SELECT = `
  id, schedule_date, faculty_status, is_time_changed, is_room_changed, is_replaced, is_modified,
  actual_start_time, actual_end_time, modification_note, remarks, marked_at,
  actual_faculty:faculty!actual_faculty_id(id, full_name, employee_code),
  replacement_faculty:faculty!replacement_faculty_id(id, full_name),
  actual_room:rooms!actual_room_id(id, room_code),
  daily_schedule:daily_schedule!daily_schedule_id(
    id, schedule_date, is_cancelled, is_rescheduled,
    course:courses!course_id(id, course_code, year, program, division),
    subject:subjects!subject_id(id, subject_name),
    room:rooms!room_id(id, room_code),
    time_slot:time_slots!time_slot_id(id, start_time, end_time, slot_label, sort_order),
    assigned_faculty:faculty!assigned_faculty_id(id, full_name)
  )
`;

const NAV_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  { label: 'Execution', items: [
    { key: 'r1', label: '1. Daily Summary' },
    { key: 'r2', label: '2. Faculty Lectures' },
    { key: 'r8', label: '3. Not Engaged / Unmarked' },
  ] },
  { label: 'Custom Reports', items: [
    { key: 'rc1', label: 'Daily Execution Report' },
    { key: 'rc2', label: 'Lecture Taken Report' },
  ] },
  { label: 'Academics', items: [
    { key: 'r4', label: '4. By Course' },
    { key: 'r5', label: '5. By Subject' },
    { key: 'r6', label: '6. By Room' },
    { key: 'r9', label: '7. Rescheduled Slots' },
  ] },
  { label: 'Leave', items: [
    { key: 'r3', label: '8. Leave Summary' },
  ] },
];

export default function ReportsPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [activeReport, setActiveReport] = useState('r1');
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [faculty, setFaculty] = useState<{ id: string; full_name: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; year: string; program: string; division: string | null }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; subject_name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; room_code: string }[]>([]);
  const [generatedBy, setGeneratedBy] = useState('Admin');

  // Shared filter fields (reused across reports contextually)
  const [date, setDate] = useState('');
  const [fFaculty, setFFaculty] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCourse, setFCourse] = useState('');
  const [fSubject, setFSubject] = useState('');
  const [fRoom, setFRoom] = useState('');
  const [fR8Status, setFR8Status] = useState('');

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [leaveSummary, setLeaveSummary] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dailyStats, setDailyStats] = useState<any | null>(null);

  // rc2 — Lecture Taken Report state
  const [rc2From, setRc2From] = useState('');
  const [rc2To, setRc2To] = useState('');
  const [rc2Type, setRc2Type] = useState('all');
  const [rc2FacultyIds, setRc2FacultyIds] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rc2Data, setRc2Data] = useState<any[]>([]);
  const [rc2Loading, setRc2Loading] = useState(false);
  const [rc2HasRun, setRc2HasRun] = useState(false);
  const [rc2Search, setRc2Search] = useState('');

  useEffect(() => {
    preloadLogoForPDF();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data } = await supabase.from('admin_users').select('full_name').eq('id', authData.user.id).maybeSingle();
        if (data?.full_name) setGeneratedBy(data.full_name);
      }
      setDropdownsLoading(true);
      const [f, c, s, r] = await Promise.all([
        supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('courses').select('id, year, program, division').eq('is_active', true).order('year').order('program'),
        supabase.from('subjects').select('id, subject_name').eq('is_active', true).order('subject_name'),
        supabase.from('rooms').select('id, room_code').eq('is_active', true).order('room_code'),
      ]);
      setFaculty(f.data ?? []);
      setCourses(c.data ?? []);
      setSubjects(s.data ?? []);
      setRooms(r.data ?? []);
      setDropdownsLoading(false);
    })();
  }, [supabase]);

  useEffect(() => {
    const els = ['r1Date', 'rc1Date', 'r2From', 'r2To', 'r3From', 'r3To', 'r4From', 'r4To', 'r5From', 'r5To', 'r6From', 'r6To', 'r8From', 'r8To', 'r9From', 'r9To', 'rc2From', 'rc2To'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fps: any[] = [];
    els.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const isDate = id.endsWith('Date');
      const fp = flatpickr(el, {
        dateFormat: 'Y-m-d',
        disableMobile: true,
        onChange: ([d]) => {
          const val = d ? d.toISOString().slice(0, 10) : '';
          if (isDate) setDate(val);
          else if (id === 'rc2From') setRc2From(val);
          else if (id === 'rc2To') setRc2To(val);
          else if (id.endsWith('From')) setFFrom(val);
          else setFTo(val);
        },
      });
      fps.push(fp);
    });
    return () => fps.forEach((fp) => fp.destroy());
  }, [activeReport]);

  function switchReport(key: string) {
    setActiveReport(key);
    setRows([]);
    setLeaveSummary([]);
    setDailyStats(null);
    setHasRun(false);
    setSearch('');
    setRc2Data([]);
    setRc2HasRun(false);
    setRc2Search('');
  }

  async function runReport() {
    setLoading(true);
    setHasRun(true);
    try {
      if (activeReport === 'r1' || activeReport === 'rc1') {
        if (!date) { toast('Please select a date.', 'warn'); setLoading(false); return; }
        const { data: exec, error } = await supabase.from('lecture_execution').select(EXEC_SELECT).eq('schedule_date', date);
        if (error) throw error;
        const flat = (exec ?? []).filter((r) => r.daily_schedule);
        setRows(flat);

        const { data: sched } = await supabase.from('daily_schedule').select('id, is_cancelled, time_slot:time_slots!time_slot_id(slot_type)').eq('schedule_date', date);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lectureSched = ((sched ?? []) as any[]).filter((r) => r.time_slot?.slot_type === 'lecture');
        setDailyStats({
          total: lectureSched.length,
          cancelled: lectureSched.filter((r) => r.is_cancelled).length,
          marked: flat.length,
          on_time: flat.filter((r) => r.faculty_status === 'on_time').length,
          late: flat.filter((r) => r.faculty_status === 'late').length,
          not_engaged: flat.filter((r) => r.faculty_status === 'not_engaged').length,
          not_marked: flat.filter((r) => r.faculty_status === 'not_marked').length,
        });
      } else if (activeReport === 'r2') {
        if (!fFrom || !fTo) { toast('From and To dates are required.', 'warn'); setLoading(false); return; }
        const q = supabase.from('lecture_execution').select(EXEC_SELECT).gte('schedule_date', fFrom).lte('schedule_date', fTo);
        const { data, error } = await q;
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let flat = ((data ?? []) as any[]).filter((r) => r.daily_schedule);
        if (fFaculty) flat = flat.filter((r) => r.actual_faculty?.id === fFaculty || r.daily_schedule?.assigned_faculty?.id === fFaculty);
        if (fStatus) flat = flat.filter((r) => r.faculty_status === fStatus || (fStatus === 'not_engaged' && r.is_replaced));
        setRows(flat);
      } else if (activeReport === 'r4' || activeReport === 'r5' || activeReport === 'r6' || activeReport === 'r8') {
        const needsFrom = activeReport === 'r8';
        if (activeReport === 'r4' && !fCourse) { toast('Please select a course.', 'warn'); setLoading(false); return; }
        if (activeReport === 'r5' && !fSubject) { toast('Please select a subject.', 'warn'); setLoading(false); return; }
        if (activeReport === 'r6' && !fRoom) { toast('Please select a room.', 'warn'); setLoading(false); return; }
        if (needsFrom && (!fFrom || !fTo)) { toast('From and To dates are required.', 'warn'); setLoading(false); return; }

        let q = supabase.from('lecture_execution').select(EXEC_SELECT);
        if (fFrom) q = q.gte('schedule_date', fFrom);
        if (fTo) q = q.lte('schedule_date', fTo);
        const { data, error } = await q;
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let flat = ((data ?? []) as any[]).filter((r) => r.daily_schedule);

        if (activeReport === 'r4') flat = flat.filter((r) => r.daily_schedule?.course?.id === fCourse);
        if (activeReport === 'r5') flat = flat.filter((r) => r.daily_schedule?.subject?.id === fSubject);
        if (activeReport === 'r6') flat = flat.filter((r) => r.daily_schedule?.room?.id === fRoom);
        if (activeReport === 'r4' && fStatus) flat = flat.filter((r) => r.faculty_status === fStatus);
        if (activeReport === 'r8') {
          if (fFaculty) flat = flat.filter((r) => r.actual_faculty?.id === fFaculty || r.daily_schedule?.assigned_faculty?.id === fFaculty);
          if (fCourse) flat = flat.filter((r) => r.daily_schedule?.course?.id === fCourse);
          flat = flat.filter((r) => r.faculty_status === 'not_engaged' || r.faculty_status === 'not_marked' || r.is_replaced);
          if (fR8Status) flat = flat.filter((r) => (fR8Status === 'not_engaged' ? (r.faculty_status === 'not_engaged' || r.is_replaced) : r.faculty_status === fR8Status));
        }
        setRows(flat);
      } else if (activeReport === 'r9') {
        if (!fFrom || !fTo) { toast('From and To dates are required.', 'warn'); setLoading(false); return; }
        const q = supabase
          .from('daily_schedule')
          .select(
            `id, schedule_date, is_rescheduled, cancel_reason,
             course:courses!course_id(year, program, division), subject:subjects!subject_id(subject_name),
             room:rooms!room_id(room_code), time_slot:time_slots!time_slot_id(start_time, end_time),
             assigned_faculty:faculty!assigned_faculty_id(full_name)`
          )
          .eq('is_rescheduled', true)
          .gte('schedule_date', fFrom)
          .lte('schedule_date', fTo)
          .order('schedule_date', { ascending: false });
        const { data, error } = await q;
        if (error) throw error;
        setRows(data ?? []);
      } else if (activeReport === 'r3') {
        let q = supabase
          .from('faculty_leaves')
          .select('id, leave_date, leave_type, reason, status, faculty:faculty!faculty_id(id, full_name, employee_code), entered_by_admin:admin_users!entered_by(full_name)')
          .order('leave_date', { ascending: false });
        if (fFaculty) q = q.eq('faculty_id', fFaculty);
        if (fFrom) q = q.gte('leave_date', fFrom);
        if (fTo) q = q.lte('leave_date', fTo);
        const { data, error } = await q;
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (data ?? []) as any[];
        setRows(list);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summaryMap: Record<string, any> = {};
        for (const r of list) {
          const fid = r.faculty?.id;
          if (!fid) continue;
          if (!summaryMap[fid]) summaryMap[fid] = { faculty: r.faculty, counts: {}, total: 0 };
          summaryMap[fid].counts[r.leave_type] = (summaryMap[fid].counts[r.leave_type] ?? 0) + 1;
          summaryMap[fid].total++;
        }
        setLeaveSummary(Object.values(summaryMap));
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── rc2: Lecture Taken Report (load calculation) ────────────────
  async function runRc2() {
    if (!rc2From || !rc2To) { toast('From and To dates are required.', 'warn'); return; }
    setRc2Loading(true);
    setRc2HasRun(true);
    setRc2Search('');
    try {
      const { data: holRows } = await supabase.from('holidays').select('holiday_date').gte('holiday_date', rc2From).lte('holiday_date', rc2To);
      const holidayDates = new Set((holRows ?? []).map((h) => h.holiday_date));

      const dayCounts: Record<string, number> = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 };
      const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const curr = new Date(rc2From);
      const end = new Date(rc2To);
      while (curr <= end) {
        const d = new Date(curr.getTime() - curr.getTimezoneOffset() * 60000);
        const dateStr = d.toISOString().split('T')[0];
        if (!holidayDates.has(dateStr) && curr.getDay() !== 0) {
          dayCounts[daysMap[curr.getDay()]]++;
        }
        curr.setDate(curr.getDate() + 1);
      }

      const { data: facData } = await supabase.from('faculty').select('id, full_name, faculty_type');
      const facMap: Record<string, string> = {};
      const facIdToName: Record<string, string> = {};
      (facData ?? []).forEach((f) => {
        facMap[f.full_name] = f.faculty_type;
        facIdToName[f.id] = f.full_name;
      });

      const { data: masterData, error: masterError } = await supabase.from('master_timetable').select(`
        day_type, course:courses!course_id(id, year, program, division),
        subject:subjects!subject_id(id, subject_name), assigned_faculty:faculty!faculty_id(id, full_name)
      `);
      if (masterError) throw masterError;

      const { data: dailyDataAll, error: dailyError } = await supabase
        .from('daily_schedule')
        .select(
          `id, schedule_date, is_cancelled, is_rescheduled, original_faculty_id, assigned_faculty_id,
           course:courses!course_id(id, year, program, division), subject:subjects!subject_id(id, subject_name),
           assigned_faculty:faculty!assigned_faculty_id(id, full_name), original_faculty:faculty!original_faculty_id(id, full_name),
           csf:course_subject_faculty!csf_id(subject:subjects!subject_id(subject_name))`
        )
        .gte('schedule_date', rc2From)
        .lte('schedule_date', rc2To)
        .eq('is_cancelled', false);
      if (dailyError) throw dailyError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dailyData = ((dailyDataAll ?? []) as any[]).filter((r) => !holidayDates.has(r.schedule_date));

      let execRows: { daily_schedule_id: string; faculty_status: string }[] = [];
      if (dailyData.length > 0) {
        const { data: ex, error: exErr } = await supabase.from('lecture_execution').select('daily_schedule_id, faculty_status').gte('schedule_date', rc2From).lte('schedule_date', rc2To).limit(50000);
        if (exErr) throw exErr;
        execRows = ex ?? [];
      }
      const execMap: Record<string, string> = {};
      for (const ex of execRows) execMap[ex.daily_schedule_id] = ex.faculty_status;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groupMap: Record<string, any> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getCourseKey = (c: any) => (c ? (c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`) : 'Unknown');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((masterData ?? []) as any[]).forEach((row) => {
        const courseKey = getCourseKey(row.course);
        const subKey = row.subject?.subject_name ?? 'Unknown';
        const fName = row.assigned_faculty?.full_name ?? '—';
        const key = `${fName}|||${courseKey}|||${subKey}`;
        if (!groupMap[key]) groupMap[key] = { course: courseKey, subject: subKey, faculty: fName, load: 0, scheduled: 0, taken: 0, late: 0 };
        groupMap[key].load += dayCounts[row.day_type] || 0;
      });

      dailyData.forEach((row) => {
        const courseKey = getCourseKey(row.course);
        const origFName = row.original_faculty?.full_name ?? '—';
        const assignFName = row.assigned_faculty?.full_name ?? '—';
        const isReplaced = row.is_rescheduled && row.original_faculty_id && row.assigned_faculty_id && row.original_faculty_id !== row.assigned_faculty_id;
        const exStatus = execMap[row.id];

        if (isReplaced) {
          const origSub = row.subject?.subject_name ?? 'Unknown';
          const origKey = `${origFName}|||${courseKey}|||${origSub}`;
          if (!groupMap[origKey]) groupMap[origKey] = { course: courseKey, subject: origSub, faculty: origFName, load: 0, scheduled: 0, taken: 0, late: 0 };
          groupMap[origKey].scheduled++;

          const newSub = row.csf?.subject?.subject_name ?? row.subject?.subject_name;
          const repKey = `${assignFName}|||${courseKey}|||${newSub}`;
          if (!groupMap[repKey]) groupMap[repKey] = { course: courseKey, subject: newSub, faculty: assignFName, load: 0, scheduled: 0, taken: 0, late: 0 };
          if (exStatus === 'on_time' || exStatus === 'late') {
            groupMap[repKey].taken++;
            if (exStatus === 'late') groupMap[repKey].late++;
          }
        } else {
          const normSub = row.subject?.subject_name ?? 'Unknown';
          const normKey = `${origFName}|||${courseKey}|||${normSub}`;
          if (!groupMap[normKey]) groupMap[normKey] = { course: courseKey, subject: normSub, faculty: origFName, load: 0, scheduled: 0, taken: 0, late: 0 };
          groupMap[normKey].scheduled++;
          if (exStatus === 'on_time' || exStatus === 'late') {
            groupMap[normKey].taken++;
            if (exStatus === 'late') groupMap[normKey].late++;
          }
        }
      });

      const selNames = rc2FacultyIds.map((id) => facIdToName[id]);
      const result = Object.values(groupMap)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((g: any) => ({ ...g, extra: Math.max(0, g.taken - g.scheduled), facType: facMap[g.faculty] || 'fulltime' }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((g: any) => {
          if (rc2Type !== 'all' && g.facType !== rc2Type) return false;
          if (selNames.length > 0 && !selNames.includes(g.faculty)) return false;
          if (g.load === 0 && g.scheduled === 0 && g.taken === 0) return false;
          return true;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => a.faculty.localeCompare(b.faculty) || a.course.localeCompare(b.course));

      setRc2Data(result);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRc2Loading(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function rc2RowsWithSubtotals(dataArray: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any[] = [];
    if (!dataArray.length) return out;
    let currentFaculty = dataArray[0].faculty;
    let s = { load: 0, sched: 0, taken: 0, late: 0, extra: 0 };
    const g = { load: 0, sched: 0, taken: 0, late: 0, extra: 0 };

    const pushSubtotal = (facName: string) => {
      out.push({ isSubtotal: true, faculty: facName, ...s });
    };

    dataArray.forEach((r, idx) => {
      if (r.faculty !== currentFaculty) {
        pushSubtotal(currentFaculty);
        s = { load: 0, sched: 0, taken: 0, late: 0, extra: 0 };
        currentFaculty = r.faculty;
      }
      s.load += r.load; s.sched += r.scheduled; s.taken += r.taken; s.late += r.late; s.extra += r.extra;
      g.load += r.load; g.sched += r.scheduled; g.taken += r.taken; g.late += r.late; g.extra += r.extra;
      out.push({ isSubtotal: false, ...r });
      if (idx === dataArray.length - 1) pushSubtotal(currentFaculty);
    });

    out.push({ isGrandTotal: true, ...g });
    return out;
  }

  function rc2SearchFilter(dataArray: typeof rc2Data) {
    if (!rc2Search) return dataArray;
    const q = rc2Search.toLowerCase();
    return dataArray.filter((r) => `${r.course} ${r.subject} ${r.faculty}`.toLowerCase().includes(q));
  }

  async function rc2ExportExcel() {
    if (!rc2Data.length) return toast('Run report first.', 'warn');
    const XLSX = await import('xlsx');
    const ftData = rc2Data.filter((d) => d.facType !== 'visiting');
    const visData = rc2Data.filter((d) => d.facType === 'visiting');

    function toExcelRows(dataArray: typeof rc2Data, typeLabel: string) {
      const rows = rc2RowsWithSubtotals(dataArray);
      return rows.map((r) => {
        if (r.isGrandTotal) return { type: '', course: 'GRAND TOTAL:', subject: '', load: r.load, faculty: '', scheduled: r.sched, taken: r.taken, late: r.late, extra: r.extra };
        if (r.isSubtotal) return { type: '', course: `Total for ${r.faculty}:`, subject: '', load: r.load, faculty: '', scheduled: r.sched, taken: r.taken, late: r.late, extra: r.extra };
        return { type: typeLabel, course: r.course, subject: r.subject, load: r.load, faculty: r.faculty, scheduled: r.scheduled, taken: r.taken, late: r.late, extra: r.extra };
      });
    }

    const excelData = [...toExcelRows(ftData, 'Full-Time'), ...toExcelRows(visData, 'Visiting')];
    const headers = [
      { header: 'Faculty Type', key: 'type' }, { header: 'Class', key: 'course' }, { header: 'Subject', key: 'subject' },
      { header: 'Load', key: 'load' }, { header: 'Teacher Name', key: 'faculty' }, { header: 'Scheduled', key: 'scheduled' },
      { header: 'Lec Taken', key: 'taken' }, { header: 'Late', key: 'late' }, { header: 'Extra', key: 'extra' },
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers.map((h) => h.header), ...excelData.map((r) => headers.map((h) => (r as Record<string, unknown>)[h.key] ?? ''))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lecture Taken');
    XLSX.writeFile(wb, 'Lecture_Taken_Report.xlsx');
  }

  async function rc2ExportPdf() {
    if (!rc2Data.length) return toast('Run report first.', 'warn');
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const subtitle = `Period: ${fmtDate(rc2From)} to ${fmtDate(rc2To)}`;
    const head = [['Class', 'Subject', 'Teacher Name', 'Scheduled', 'Lec Taken', 'Late', 'Extra']];

    function pdfBody(dataArray: typeof rc2Data) {
      const rows = rc2RowsWithSubtotals(dataArray);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return rows.map((r): any => {
        if (r.isGrandTotal) {
          return [
            { content: 'GRAND TOTAL:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 225, 240], textColor: [26, 34, 68] } },
            { content: r.load.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
            { content: r.sched.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
            { content: r.taken.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
            { content: r.late.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
            { content: r.extra.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
          ];
        }
        if (r.isSubtotal) {
          return [
            { content: `Total for ${r.faculty}:`, colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 245] } },
            { content: r.sched.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
            { content: r.taken.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
            { content: r.late.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
            { content: r.extra.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
          ];
        }
        return [r.course, r.subject, r.faculty, r.scheduled.toString(), r.taken.toString(), r.late.toString(), r.extra.toString()];
      });
    }

    const drawHeader = (data: { pageNumber: number }) => {
      const cx = pageW / 2;
      doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(26, 34, 68);
      doc.text('B. K. Birla College, Kalyan', cx, 15, { align: 'center' });
      doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 60, 90);
      doc.text('(Empowered Autonomous Status)', cx, 20, { align: 'center' });
      doc.setFont('times', 'bolditalic'); doc.setFontSize(10);
      doc.text('Department of Management Studies', cx, 25, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(26, 34, 68);
      doc.text('Lecture Taken Report', cx, 34, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 100, 120);
      doc.text(subtitle, cx, 40, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80);
      doc.text(`Report Generated By: ${generatedBy}`, 14, pageH - 9);
      doc.text(`Report Generated On: ${new Date().toLocaleString('en-IN')}`, 14, pageH - 4.5);
      doc.setTextColor(150);
      doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 4.5, { align: 'center' });
    };

    const ftData = rc2Data.filter((d) => d.facType !== 'visiting');
    const visData = rc2Data.filter((d) => d.facType === 'visiting');
    let currentY = 52;

    if (ftData.length > 0) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 34, 68);
      doc.text('Full-Time Faculty', 14, currentY);
      currentY += 4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head, body: pdfBody(ftData), startY: currentY, margin: { top: 52, left: 14, right: 14, bottom: 20 }, theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' }, headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 42 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 12, halign: 'center' } },
        didDrawPage: drawHeader,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }
    if (visData.length > 0) {
      if (currentY + 20 > pageH) { doc.addPage(); currentY = 52; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 34, 68);
      doc.text('Visiting Faculty', 14, currentY);
      currentY += 4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head, body: pdfBody(visData), startY: currentY, margin: { top: 52, left: 14, right: 14, bottom: 20 }, theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' }, headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 42 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 12, halign: 'center' } },
        didDrawPage: drawHeader,
      });
    }
    doc.save('Lecture_Taken_Report.pdf');
  }

  // ── Table config per report ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo((): { header: string; render: (r: any) => React.ReactNode; exportVal: (r: any) => string }[] => {
    switch (activeReport) {
      case 'r1':
        return [
          { header: 'Time', render: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time), exportVal: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time) },
          { header: 'Room', render: (r) => r.daily_schedule?.room?.room_code ?? '—', exportVal: (r) => r.daily_schedule?.room?.room_code ?? '—' },
          { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), exportVal: (r) => courseLbl(r.daily_schedule?.course) },
          { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', exportVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
          { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? r.daily_schedule?.assigned_faculty?.full_name ?? '—', exportVal: (r) => r.actual_faculty?.full_name ?? '—' },
          { header: 'Status', render: (r) => <span className="badge badge-type">{STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span>, exportVal: (r) => STATUS_LABELS[r.faculty_status] ?? r.faculty_status },
          { header: 'Flags', render: (r) => flagsOf(r).join(', ') || '—', exportVal: (r) => flagsOf(r).join(', ') || '—' },
        ];
      case 'r2':
        return [
          { header: 'Date', render: (r) => fmtDate(r.schedule_date), exportVal: (r) => fmtDate(r.schedule_date) },
          { header: 'Time', render: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time), exportVal: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time) },
          { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), exportVal: (r) => courseLbl(r.daily_schedule?.course) },
          { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', exportVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
          { header: 'Status', render: (r) => <span className="badge badge-type">{STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span>, exportVal: (r) => STATUS_LABELS[r.faculty_status] ?? r.faculty_status },
          { header: 'Flags', render: (r) => flagsOf(r).join(', ') || '—', exportVal: (r) => flagsOf(r).join(', ') || '—' },
          { header: 'Remarks', render: (r) => r.remarks ?? '—', exportVal: (r) => r.remarks ?? '—' },
        ];
      case 'r4':
        return [
          { header: 'Date', render: (r) => fmtDate(r.schedule_date), exportVal: (r) => fmtDate(r.schedule_date) },
          { header: 'Time', render: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time), exportVal: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time) },
          { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', exportVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
          { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? '—', exportVal: (r) => r.actual_faculty?.full_name ?? '—' },
          { header: 'Room', render: (r) => r.daily_schedule?.room?.room_code ?? '—', exportVal: (r) => r.daily_schedule?.room?.room_code ?? '—' },
          { header: 'Status', render: (r) => <span className="badge badge-type">{STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span>, exportVal: (r) => STATUS_LABELS[r.faculty_status] ?? r.faculty_status },
          { header: 'Flags', render: (r) => flagsOf(r).join(', ') || '—', exportVal: (r) => flagsOf(r).join(', ') || '—' },
        ];
      case 'r5':
        return [
          { header: 'Date', render: (r) => fmtDate(r.schedule_date), exportVal: (r) => fmtDate(r.schedule_date) },
          { header: 'Time', render: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time), exportVal: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time) },
          { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), exportVal: (r) => courseLbl(r.daily_schedule?.course) },
          { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? '—', exportVal: (r) => r.actual_faculty?.full_name ?? '—' },
          { header: 'Room', render: (r) => r.daily_schedule?.room?.room_code ?? '—', exportVal: (r) => r.daily_schedule?.room?.room_code ?? '—' },
          { header: 'Status', render: (r) => <span className="badge badge-type">{STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span>, exportVal: (r) => STATUS_LABELS[r.faculty_status] ?? r.faculty_status },
        ];
      case 'r6':
        return [
          { header: 'Date', render: (r) => fmtDate(r.schedule_date), exportVal: (r) => fmtDate(r.schedule_date) },
          { header: 'Time', render: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time), exportVal: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time) },
          { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), exportVal: (r) => courseLbl(r.daily_schedule?.course) },
          { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', exportVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
          { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? '—', exportVal: (r) => r.actual_faculty?.full_name ?? '—' },
          { header: 'Status', render: (r) => <span className="badge badge-type">{STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span>, exportVal: (r) => STATUS_LABELS[r.faculty_status] ?? r.faculty_status },
        ];
      case 'r8':
        return [
          { header: 'Date', render: (r) => fmtDate(r.schedule_date), exportVal: (r) => fmtDate(r.schedule_date) },
          { header: 'Time', render: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time), exportVal: (r) => fmtTime(r.daily_schedule?.time_slot?.start_time) },
          { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), exportVal: (r) => courseLbl(r.daily_schedule?.course) },
          { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', exportVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
          { header: 'Faculty', render: (r) => r.daily_schedule?.assigned_faculty?.full_name ?? '—', exportVal: (r) => r.daily_schedule?.assigned_faculty?.full_name ?? '—' },
          { header: 'Status', render: (r) => <span className="badge badge-type">{r.is_replaced ? 'Not Engaged (Replaced)' : STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span>, exportVal: (r) => (r.is_replaced ? 'Not Engaged (Replaced)' : STATUS_LABELS[r.faculty_status] ?? r.faculty_status) },
          { header: 'Remarks', render: (r) => r.remarks ?? '—', exportVal: (r) => r.remarks ?? '—' },
        ];
      case 'r9':
        return [
          { header: 'Date', render: (r) => fmtDate(r.schedule_date), exportVal: (r) => fmtDate(r.schedule_date) },
          { header: 'Time', render: (r) => fmtTime(r.time_slot?.start_time), exportVal: (r) => fmtTime(r.time_slot?.start_time) },
          { header: 'Room', render: (r) => r.room?.room_code ?? '—', exportVal: (r) => r.room?.room_code ?? '—' },
          { header: 'Course', render: (r) => courseLbl(r.course), exportVal: (r) => courseLbl(r.course) },
          { header: 'New Subject', render: (r) => r.subject?.subject_name ?? '—', exportVal: (r) => r.subject?.subject_name ?? '—' },
          { header: 'New Faculty', render: (r) => r.assigned_faculty?.full_name ?? '—', exportVal: (r) => r.assigned_faculty?.full_name ?? '—' },
        ];
      case 'r3':
        return [
          { header: 'Faculty', render: (r) => r.faculty?.full_name ?? '—', exportVal: (r) => r.faculty?.full_name ?? '—' },
          { header: 'Date', render: (r) => fmtDate(r.leave_date), exportVal: (r) => fmtDate(r.leave_date) },
          { header: 'Leave Type', render: (r) => r.leave_type, exportVal: (r) => r.leave_type },
          { header: 'Reason', render: (r) => r.reason ?? '—', exportVal: (r) => r.reason ?? '—' },
          { header: 'Status', render: (r) => <span className={`badge ${r.status === 'approved' ? 'badge-approved' : 'badge-rejected'}`}>{r.status}</span>, exportVal: (r) => r.status },
        ];
      default:
        return [];
    }
  }, [activeReport]);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => columns.some((c) => c.exportVal(r).toLowerCase().includes(q)));
  }, [rows, search, columns]);

  function handleExportExcel() {
    if (!filteredRows.length) return toast('No data to export', 'warn');
    const cols: ExportColumn[] = columns.map((c, i) => ({ header: c.header, key: `c${i}` }));
    const flat = filteredRows.map((r) => Object.fromEntries(columns.map((c, i) => [`c${i}`, c.exportVal(r)])));
    exportToExcel(flat, cols, `Report_${activeReport}`);
  }
  function handleExportPdf() {
    if (!filteredRows.length) return toast('No data to export', 'warn');
    const cols: ExportColumn[] = columns.map((c, i) => ({ header: c.header, key: `c${i}` }));
    const flat = filteredRows.map((r) => Object.fromEntries(columns.map((c, i) => [`c${i}`, c.exportVal(r)])));
    const title = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeReport)?.label ?? 'Report';
    exportToPDF(flat, cols, title, `Report_${activeReport}`, '', generatedBy);
  }

  const facultyOptions = faculty.map((f) => ({ value: f.id, label: f.full_name }));
  const courseOptions = courses.map((c) => ({ value: c.id, label: courseLbl(c) }));
  const subjectOptions = subjects.map((s) => ({ value: s.id, label: s.subject_name }));
  const roomOptions = rooms.map((r) => ({ value: r.id, label: r.room_code }));

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Run, search, and export reports across the system</p>
        </div>
      </div>

      <div className="content">
        <div className="report-layout">
          <div className="report-nav">
            {NAV_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="report-nav-label">{g.label}</div>
                {g.items.map((i) => (
                  <button key={i.key} className={`report-nav-btn${activeReport === i.key ? ' active' : ''}`} onClick={() => switchReport(i.key)}>
                    {i.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="report-panel">
            <div className="report-section active">
              <div className="report-header">
                <div className="report-title">{NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeReport)?.label}</div>
                <div className="export-btns">
                  {activeReport === 'rc2' ? (
                    <>
                      <input type="text" className="table-search" placeholder="🔍 Search records..." value={rc2Search} onChange={(e) => setRc2Search(e.target.value)} />
                      <button className="btn btn-ghost btn-sm" onClick={rc2ExportPdf}>PDF</button>
                      <button className="btn btn-ghost btn-sm" onClick={rc2ExportExcel}>Excel</button>
                    </>
                  ) : (
                    <>
                      <input type="text" className="table-search" placeholder="🔍 Search table..." value={search} onChange={(e) => setSearch(e.target.value)} />
                      <button className="btn btn-ghost btn-sm" onClick={handleExportPdf}>PDF</button>
                      <button className="btn btn-ghost btn-sm" onClick={handleExportExcel}>Excel</button>
                    </>
                  )}
                </div>
              </div>

              <div className="filter-card">
                {activeReport === 'rc2' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>From Date *</label><input type="text" id="rc2From" placeholder="From" readOnly /></div>
                    <div className="field"><label>To Date *</label><input type="text" id="rc2To" placeholder="To" readOnly /></div>
                    <div className="field">
                      <label>Faculty Type</label>
                      <select value={rc2Type} onChange={(e) => setRc2Type(e.target.value)}>
                        <option value="all">All Types</option><option value="fulltime">Full-Time</option><option value="visiting">Visiting</option>
                      </select>
                    </div>
                    <div className="field" style={{ flex: 2, minWidth: 250 }}>
                      <label>Select Faculty</label>
                      <TomSelectMulti options={facultyOptions} value={rc2FacultyIds} onChange={setRc2FacultyIds} placeholder="All Faculty (Select to filter)" />
                    </div>
                  </>
                )}
                {(activeReport === 'r1' || activeReport === 'rc1') && (
                  <div className="field"><label>Date</label><input type="text" id={activeReport === 'r1' ? 'r1Date' : 'rc1Date'} placeholder="Pick date" readOnly /></div>
                )}
                {activeReport === 'r2' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>Faculty</label><TomSelectField options={facultyOptions} value={fFaculty} onChange={setFFaculty} placeholder="All Faculty" allowEmptyOption /></div>
                    <div className="field"><label>From</label><input type="text" id="r2From" placeholder="From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r2To" placeholder="To" readOnly /></div>
                    <div className="field">
                      <label>Status</label>
                      <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                        <option value="">All</option><option value="on_time">On Time</option><option value="late">Late</option><option value="not_engaged">Not Engaged</option><option value="not_marked">Not Marked</option>
                      </select>
                    </div>
                  </>
                )}
                {activeReport === 'r3' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>Faculty</label><TomSelectField options={facultyOptions} value={fFaculty} onChange={setFFaculty} placeholder="All Faculty" allowEmptyOption /></div>
                    <div className="field"><label>From</label><input type="text" id="r3From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r3To" readOnly /></div>
                  </>
                )}
                {activeReport === 'r4' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>Course *</label><TomSelectField options={courseOptions} value={fCourse} onChange={setFCourse} placeholder="— select course —" allowEmptyOption /></div>
                    <div className="field"><label>From</label><input type="text" id="r4From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r4To" readOnly /></div>
                    <div className="field">
                      <label>Status</label>
                      <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                        <option value="">All</option><option value="on_time">On Time</option><option value="late">Late</option><option value="not_engaged">Not Engaged</option><option value="not_marked">Not Marked</option>
                      </select>
                    </div>
                  </>
                )}
                {activeReport === 'r5' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>Subject *</label><TomSelectField options={subjectOptions} value={fSubject} onChange={setFSubject} placeholder="— select subject —" allowEmptyOption /></div>
                    <div className="field"><label>From</label><input type="text" id="r5From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r5To" readOnly /></div>
                  </>
                )}
                {activeReport === 'r6' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>Room *</label><TomSelectField options={roomOptions} value={fRoom} onChange={setFRoom} placeholder="— select room —" allowEmptyOption /></div>
                    <div className="field"><label>From</label><input type="text" id="r6From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r6To" readOnly /></div>
                  </>
                )}
                {activeReport === 'r8' && !dropdownsLoading && (
                  <>
                    <div className="field"><label>From</label><input type="text" id="r8From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r8To" readOnly /></div>
                    <div className="field"><label>Faculty</label><TomSelectField options={facultyOptions} value={fFaculty} onChange={setFFaculty} placeholder="All" allowEmptyOption /></div>
                    <div className="field"><label>Course</label><TomSelectField options={courseOptions} value={fCourse} onChange={setFCourse} placeholder="All" allowEmptyOption /></div>
                    <div className="field">
                      <label>Status</label>
                      <select value={fR8Status} onChange={(e) => setFR8Status(e.target.value)}>
                        <option value="">Both</option><option value="not_engaged">Not Engaged only</option><option value="not_marked">Not Marked only</option>
                      </select>
                    </div>
                  </>
                )}
                {activeReport === 'r9' && (
                  <>
                    <div className="field"><label>From</label><input type="text" id="r9From" readOnly /></div>
                    <div className="field"><label>To</label><input type="text" id="r9To" readOnly /></div>
                  </>
                )}
                <button className="btn btn-primary btn-sm" onClick={activeReport === 'rc2' ? runRc2 : runReport} disabled={activeReport === 'rc2' ? rc2Loading : loading}>
                  {activeReport === 'rc2' ? (rc2Loading ? 'Running…' : 'Run Report') : loading ? 'Running…' : 'Run Report'}
                </button>
              </div>

              {activeReport === 'r1' && dailyStats && (
                <div className="mini-stats">
                  <div className="mini-stat"><div className="mini-stat-val">{dailyStats.total}</div><div className="mini-stat-lbl">Scheduled</div></div>
                  <div className="mini-stat"><div className="mini-stat-val">{dailyStats.marked}</div><div className="mini-stat-lbl">Marked</div></div>
                  <div className="mini-stat"><div className="mini-stat-val">{dailyStats.on_time}</div><div className="mini-stat-lbl">On Time</div></div>
                  <div className="mini-stat"><div className="mini-stat-val">{dailyStats.late}</div><div className="mini-stat-lbl">Late</div></div>
                  <div className="mini-stat"><div className="mini-stat-val">{dailyStats.not_engaged}</div><div className="mini-stat-lbl">Not Engaged</div></div>
                  <div className="mini-stat"><div className="mini-stat-val">{dailyStats.cancelled}</div><div className="mini-stat-lbl">Cancelled</div></div>
                </div>
              )}

              <div className="result-count">
                {activeReport === 'rc2'
                  ? rc2HasRun && !rc2Loading ? `${rc2Data.length} active class rows found` : ''
                  : hasRun && !loading ? `${filteredRows.length} record(s) found` : ''}
              </div>

              {activeReport === 'rc2' ? (
                <div style={{ overflowX: 'auto' }}>
                  {!rc2HasRun ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Set date range and run report.</div>
                  ) : rc2Loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}><span className="spin" /></div>
                  ) : rc2Data.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data found for these filters.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      {(() => {
                        const ftData = rc2SearchFilter(rc2Data.filter((d) => d.facType !== 'visiting'));
                        const visData = rc2SearchFilter(rc2Data.filter((d) => d.facType === 'visiting'));
                        const renderTable = (dataArray: typeof rc2Data, title: string) => {
                          if (!dataArray.length) return null;
                          const withTotals = rc2RowsWithSubtotals(dataArray);
                          return (
                            <div key={title}>
                              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{title}</h3>
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>Class</th><th>Subject</th><th>Load</th><th>Teacher Name</th><th>Scheduled</th><th>Lec Taken</th><th>Late</th><th>Extra</th></tr></thead>
                                  <tbody>
                                    {withTotals.map((r, i) =>
                                      r.isGrandTotal ? (
                                        <tr key={i} style={{ background: 'rgba(79, 106, 245, 0.08)', borderTop: '2px solid var(--border)', fontWeight: 800 }}>
                                          <td colSpan={2} style={{ textAlign: 'right', color: 'var(--accent)' }}>GRAND TOTAL:</td>
                                          <td style={{ textAlign: 'center', color: 'var(--accent)' }}>{r.load}</td><td></td>
                                          <td style={{ textAlign: 'center', color: 'var(--accent)' }}>{r.sched}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--success)' }}>{r.taken}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--warn)' }}>{r.late}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--accent)' }}>{r.extra}</td>
                                        </tr>
                                      ) : r.isSubtotal ? (
                                        <tr key={i} style={{ background: 'var(--bg-hover)', fontWeight: 700 }}>
                                          <td colSpan={2} style={{ textAlign: 'right' }}>Total for {r.faculty}:</td>
                                          <td style={{ textAlign: 'center' }}>{r.load}</td><td></td>
                                          <td style={{ textAlign: 'center' }}>{r.sched}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--success)' }}>{r.taken}</td>
                                          <td style={{ textAlign: 'center', color: r.late > 0 ? 'var(--warn)' : 'inherit' }}>{r.late}</td>
                                          <td style={{ textAlign: 'center', color: r.extra > 0 ? 'var(--accent)' : 'inherit' }}>{r.extra}</td>
                                        </tr>
                                      ) : (
                                        <tr key={i}>
                                          <td><strong>{r.course}</strong></td>
                                          <td>{r.subject}</td>
                                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.load}</td>
                                          <td>{r.faculty}</td>
                                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.scheduled}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>{r.taken}</td>
                                          <td style={{ textAlign: 'center', color: r.late > 0 ? 'var(--warn)' : 'var(--text-muted)', fontWeight: 600 }}>{r.late}</td>
                                          <td style={{ textAlign: 'center', color: r.extra > 0 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>{r.extra}</td>
                                        </tr>
                                      )
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        };
                        return (
                          <>
                            {renderTable(ftData, 'Full-Time Faculty')}
                            {renderTable(visData, 'Visiting Faculty')}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : activeReport === 'rc1' ? (
                <div style={{ overflowX: 'auto' }}>
                  {!hasRun ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Select a date and run report.</div>
                  ) : loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}><span className="spin" /></div>
                  ) : rows.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No execution data for this date.</div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Time</th><th>Room</th><th>Course</th><th>Subject</th><th>Faculty</th><th>Status</th></tr></thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={r.id ?? i}>
                              <td>{fmtTime(r.daily_schedule?.time_slot?.start_time)}</td>
                              <td>{r.daily_schedule?.room?.room_code ?? '—'}</td>
                              <td>{courseLbl(r.daily_schedule?.course)}</td>
                              <td>{r.daily_schedule?.subject?.subject_name ?? '—'}</td>
                              <td>{r.actual_faculty?.full_name ?? r.daily_schedule?.assigned_faculty?.full_name ?? '—'}</td>
                              <td><span className="badge badge-type">{STATUS_LABELS[r.faculty_status] ?? r.faculty_status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr></thead>
                    <tbody>
                      {!hasRun ? (
                        <tr className="empty-row"><td colSpan={columns.length || 1}>Set filters and run.</td></tr>
                      ) : loading ? (
                        <tr className="empty-row"><td colSpan={columns.length || 1}><span className="spin" /> Loading…</td></tr>
                      ) : filteredRows.length === 0 ? (
                        <tr className="empty-row"><td colSpan={columns.length || 1}>No records found.</td></tr>
                      ) : (
                        filteredRows.map((r, i) => (
                          <tr key={r.id ?? i}>
                            {columns.map((c) => <td key={c.header}>{c.render(r)}</td>)}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeReport === 'r3' && leaveSummary.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div className="leave-summary-grid">
                    {leaveSummary.map((s, i) => (
                      <div className="leave-type-chip" key={i}>
                        <span>{s.faculty?.full_name}</span>
                        <strong>{s.total}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
