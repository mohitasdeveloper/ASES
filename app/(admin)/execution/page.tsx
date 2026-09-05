'use client';

import { useEffect, useRef, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';
import { preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import './execution.css';

interface TimeSlot {
  id: string;
  slot_label: string | null;
  start_time: string;
  end_time: string;
  slot_type: 'lecture' | 'recess' | 'lunch';
  sort_order: number;
}
interface RoomRef {
  id: string;
  room_code: string;
}
interface ScheduleRow {
  id: string;
  is_cancelled: boolean;
  cancel_reason: string | null;
  is_rescheduled: boolean;
  time_slot_id: string | null;
  room_id: string;
  course_id: string;
  subject_id: string;
  assigned_faculty_id: string;
  original_faculty_id: string | null;
  time_slot: TimeSlot | null;
  room: RoomRef | null;
  course: { id: string; year: string; program: string; division: string | null } | null;
  subject: { id: string; subject_name: string } | null;
  assigned_faculty: { id: string; full_name: string } | null;
  original_faculty: { id: string; full_name: string } | null;
  csf: { subject: { subject_name: string } | null } | null;
}
type ScheduleMap = Record<string, Record<string, ScheduleRow>>;
interface ExecRow {
  daily_schedule_id: string;
  faculty_status: string;
}
type ExecMap = Record<string, ExecRow>;

const STATUS_CYCLE = ['on_time', 'late', 'not_engaged', 'not_marked'];
const STATUS_LABEL: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };
const STATUS_CLASS: Record<string, string> = { on_time: 's-on-time', late: 's-late', not_engaged: 's-not-engaged', not_marked: 's-not-marked' };
const PILL_CLASS: Record<string, string> = { on_time: 'sp-on-time', late: 'sp-late', not_engaged: 'sp-not-engaged', not_marked: 'sp-not-marked' };
const DAY_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function cName(c: ScheduleRow['course']) {
  if (!c) return '';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}
function localDateStr(d?: Date) {
  const dt = d ?? new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

export default function ExecutionLogPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [currentDate, setCurrentDate] = useState(localDateStr());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<RoomRef[]>([]);
  const [scheduleMap, setScheduleMap] = useState<ScheduleMap>({});
  const [execMap, setExecMap] = useState<ExecMap>({});
  const [virtualRoomId, setVirtualRoomId] = useState<string | null>(null);
  const [gridState, setGridState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [emptyMsg, setEmptyMsg] = useState('Select a date and click Load Day');
  const [showStats, setShowStats] = useState(false);
  const [generatedBy, setGeneratedBy] = useState('Admin');
  const [loadingBtn, setLoadingBtn] = useState(false);

  useEffect(() => {
    preloadLogoForPDF();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data } = await supabase.from('admin_users').select('full_name').eq('id', authData.user.id).maybeSingle();
        if (data?.full_name) setGeneratedBy(data.full_name);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    if (!dateInputRef.current) return;
    const fp = flatpickr(dateInputRef.current, {
      dateFormat: 'Y-m-d',
      defaultDate: new Date(),
      disableMobile: true,
      onChange: ([d]) => {
        if (!d) return;
        const ds = localDateStr(d);
        setCurrentDate(ds);
        loadDay(ds);
      },
    });
    return () => fp.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDay(dateArg?: string) {
    const loadDate = dateArg ?? currentDate;
    setLoadingBtn(true);
    setGridState('loading');
    setShowStats(false);

    try {
      const dayType = DAY_MAP[new Date(loadDate + 'T00:00:00').getDay()];
      const slotDt = dayType === 'saturday' ? 'saturday' : 'weekday';

      if (dayType === 'sunday') {
        setGridState('idle');
        setEmptyMsg('No schedule on Sundays.');
        return;
      }

      const { data: holChk } = await supabase.from('holidays').select('name').eq('holiday_date', loadDate).maybeSingle();
      if (holChk) {
        setGridState('idle');
        setEmptyMsg(`🎉 Holiday: ${holChk.name}. No execution log for this day.`);
        return;
      }

      const [slotsRes, roomsRes, schedRes, execRes] = await Promise.all([
        supabase.from('time_slots').select('id,slot_label,start_time,end_time,slot_type,sort_order').eq('day_type', slotDt).order('sort_order'),
        supabase.from('rooms').select('id,room_code').eq('is_active', true).order('room_code'),
        supabase
          .from('daily_schedule')
          .select(
            `id, is_cancelled, cancel_reason, is_rescheduled,
             time_slot_id, room_id, course_id, subject_id, assigned_faculty_id, original_faculty_id,
             time_slot:time_slots!time_slot_id(id,slot_label,start_time,end_time,slot_type,sort_order),
             room:rooms!room_id(id,room_code),
             course:courses!course_id(id,year,program,division),
             subject:subjects!subject_id(id,subject_name),
             assigned_faculty:faculty!assigned_faculty_id(id,full_name),
             original_faculty:faculty!original_faculty_id(id,full_name),
             csf:course_subject_faculty!csf_id(subject:subjects!subject_id(subject_name))`
          )
          .eq('schedule_date', loadDate),
        supabase.from('lecture_execution').select('daily_schedule_id,faculty_status').eq('schedule_date', loadDate),
      ]);

      if (slotsRes.error) throw new Error('Time slots: ' + slotsRes.error.message);
      if (roomsRes.error) throw new Error('Rooms: ' + roomsRes.error.message);
      if (schedRes.error) throw new Error('Schedule: ' + schedRes.error.message);

      const ts = slotsRes.data ?? [];
      let vRoomId: string | null = null;
      const physicalRooms = (roomsRes.data ?? []).filter((r) => {
        if (r.room_code?.toUpperCase() === 'VIRTUAL') {
          vRoomId = r.id;
          return false;
        }
        return true;
      });

      const sMap: ScheduleMap = {};
      for (const row of (schedRes.data as unknown as ScheduleRow[]) ?? []) {
        const t = row.time_slot_id;
        const r = row.room_id;
        if (!t) {
          if (!sMap['null']) sMap['null'] = {};
          sMap['null'][row.id] = row;
        } else {
          if (!sMap[t]) sMap[t] = {};
          sMap[t][r] = row;
        }
      }

      const eMap: ExecMap = {};
      for (const ex of execRes.data ?? []) {
        eMap[ex.daily_schedule_id] = ex;
      }

      setTimeSlots(ts);
      setRooms(physicalRooms);
      setVirtualRoomId(vRoomId);
      setScheduleMap(sMap);
      setExecMap(eMap);

      if (!schedRes.data?.length) {
        setGridState('idle');
        setEmptyMsg('No schedule found for this date. Generate it in Daily Scheduler first.');
        return;
      }

      setGridState('ready');
      setShowStats(true);
    } catch (e) {
      toast((e as Error).message, 'error');
      setGridState('idle');
      setEmptyMsg('Failed to load: ' + (e as Error).message);
    } finally {
      setLoadingBtn(false);
    }
  }

  useEffect(() => {
    loadDay(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cycleStatus(row: ScheduleRow) {
    const current = execMap[row.id]?.faculty_status ?? 'not_marked';
    const idx = STATUS_CYCLE.indexOf(current);
    const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

    // Optimistic UI update
    setExecMap((prev) => ({ ...prev, [row.id]: { daily_schedule_id: row.id, faculty_status: nextStatus } }));

    try {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase.from('lecture_execution').upsert(
        {
          daily_schedule_id: row.id,
          schedule_date: currentDate,
          actual_faculty_id: row.assigned_faculty?.id ?? null,
          faculty_status: nextStatus,
          is_time_changed: false,
          is_room_changed: false,
          is_replaced: false,
          marked_by: authData.user?.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'daily_schedule_id' }
      );
      if (error) throw error;
    } catch (e) {
      setExecMap((prev) => ({ ...prev, [row.id]: { daily_schedule_id: row.id, faculty_status: current } }));
      toast('Failed to save: ' + (e as Error).message, 'error');
    }
  }

  function renderCell(row: ScheduleRow | undefined, isVirtual: boolean) {
    if (!row) {
      if (isVirtual) return null;
      return <div className="ec s-empty" key={Math.random()} />;
    }

    const isReplaced = row.is_rescheduled && row.original_faculty_id && row.original_faculty_id !== row.assigned_faculty_id;
    const displaySubject = isReplaced ? row.csf?.subject?.subject_name ?? '—' : row.subject?.subject_name ?? '—';
    const displayFaculty = row.assigned_faculty?.full_name ?? '—';

    if (row.is_cancelled) {
      return (
        <div className={isVirtual ? 'virtual-cell s-cancelled' : 'ec s-cancelled'} key={row.id}>
          <div className="ec-course">{cName(row.course)}</div>
          <div className="ec-subject">{displaySubject}</div>
          <div className="ec-faculty">Prof. {displayFaculty}</div>
          <span className="status-pill sp-cancelled">CANCELLED</span>
        </div>
      );
    }

    const status = execMap[row.id]?.faculty_status ?? 'not_marked';
    const sc = STATUS_CLASS[status] ?? 's-not-marked';
    const pc = PILL_CLASS[status] ?? 'sp-not-marked';
    const lbl = STATUS_LABEL[status] ?? 'Not Marked';

    return (
      <div className={`${isVirtual ? 'virtual-cell' : 'ec'} ${sc} clickable`} key={row.id} onClick={() => cycleStatus(row)}>
        <div className="ec-course">{cName(row.course)}</div>
        <div className="ec-subject">{displaySubject}</div>
        <div className="ec-faculty">
          Prof. {displayFaculty} {isReplaced && <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 700 }}>(SUB)</span>}
        </div>
        <span className={`status-pill ${pc}`}>{lbl}</span>
        <span className="click-hint">update</span>
      </div>
    );
  }

  const virtualEntries = scheduleMap['null'] ? Object.values(scheduleMap['null']) : [];

  const stats = (() => {
    let onTime = 0, late = 0, notEngaged = 0, notMarked = 0, cancelled = 0;
    for (const [tsId, tsMap] of Object.entries(scheduleMap)) {
      const slot = timeSlots.find((s) => s.id === tsId);
      if (tsId !== 'null' && slot?.slot_type !== 'lecture') continue;
      for (const row of Object.values(tsMap)) {
        if (row.is_cancelled) { cancelled++; continue; }
        const status = execMap[row.id]?.faculty_status ?? 'not_marked';
        if (status === 'on_time') onTime++;
        else if (status === 'late') late++;
        else if (status === 'not_engaged') notEngaged++;
        else notMarked++;
      }
    }
    return { onTime, late, notEngaged, notMarked, cancelled };
  })();

  async function handleExportExcel() {
    if (!timeSlots.length || !rooms.length || Object.keys(scheduleMap).length === 0) return toast('No data to export', 'warn');
    const XLSX = await import('xlsx');
    const wsData: string[][] = [];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    const headRow = ['Time', ...rooms.map((r) => `Room ${r.room_code}`)];
    wsData.push(headRow);
    let rowIndex = 1;

    timeSlots.forEach((slot) => {
      const timeLabel = `${slot.slot_label || ''}\n\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;
      if (slot.slot_type !== 'lecture') {
        const lbl = slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess';
        const row = [timeLabel, lbl];
        for (let i = 1; i < rooms.length; i++) row.push('');
        wsData.push(row);
        merges.push({ s: { r: rowIndex, c: 1 }, e: { r: rowIndex, c: rooms.length } });
        rowIndex += 1;
      } else {
        const row1 = [timeLabel], row2 = [''], row3 = [''], row4 = [''];
        rooms.forEach((room) => {
          const row = scheduleMap[slot.id]?.[room.id];
          if (row) {
            const isReplaced = row.is_rescheduled && row.original_faculty_id && row.original_faculty_id !== row.assigned_faculty_id;
            const s = row.is_cancelled ? 'cancelled' : execMap[row.id]?.faculty_status ?? 'not_marked';
            const STATUS_LBL: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked', cancelled: 'CANCELLED' };
            const c = cName(row.course) || '-';
            const sub = isReplaced ? row.csf?.subject?.subject_name ?? '-' : row.subject?.subject_name ?? '-';
            const f = row.assigned_faculty?.full_name || '-';
            row1.push(c); row2.push(sub); row3.push(`Prof. ${f}`); row4.push(`[${STATUS_LBL[s] ?? 'Not Marked'}]`);
          } else {
            row1.push('-'); row2.push(''); row3.push(''); row4.push('');
          }
        });
        wsData.push(row1, row2, row3, row4);
        merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex + 3, c: 0 } });
        rowIndex += 4;
      }
    });

    if (virtualEntries.length > 0) {
      wsData.push([]); wsData.push(['Virtual lecture', '', '', '']); wsData.push(['Course', 'Subject', 'Faculty', 'Status']);
      virtualEntries.forEach((row) => {
        const c = cName(row.course);
        if (row.is_cancelled) { wsData.push([c, 'CANCELLED', '-', 'CANCELLED']); return; }
        const isReplaced = row.is_rescheduled && row.original_faculty_id !== row.assigned_faculty_id;
        const sub = isReplaced ? row.csf?.subject?.subject_name ?? '-' : row.subject?.subject_name ?? '-';
        const fac = row.assigned_faculty?.full_name ?? '-';
        const s = execMap[row.id]?.faculty_status ?? 'not_marked';
        const STATUS_LBL: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };
        wsData.push([c, sub, `Prof. ${fac}`, `[${STATUS_LBL[s] ?? 'Not Marked'}]`]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, ...rooms.map(() => ({ wch: 30 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Execution');
    XLSX.writeFile(wb, `Execution_Log_${currentDate}.xlsx`);
  }

  async function handleExportPdf() {
    if (!timeSlots.length || !rooms.length || Object.keys(scheduleMap).length === 0) return toast('No data to export', 'warn');
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a0' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const dtStr = new Date(currentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const head = [['Time', ...rooms.map((r) => `Room ${r.room_code}`)]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[] = [];

    timeSlots.forEach((slot) => {
      const timeLabel = `${slot.slot_label || ''}\n\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;
      if (slot.slot_type !== 'lecture') {
        const lbl = slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess';
        body.push([
          { content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center', fillColor: [240, 240, 245] } },
          { content: lbl, colSpan: rooms.length, styles: { halign: 'center', valign: 'middle', fontStyle: 'italic', textColor: [140, 140, 140] } },
        ]);
      } else {
        const rowData: unknown[] = [{ content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center', fillColor: [240, 240, 245] } }];
        rooms.forEach((room) => {
          const row = scheduleMap[slot.id]?.[room.id];
          if (!row) { rowData.push(''); return; }
          const isReplaced = row.is_rescheduled && row.original_faculty_id && row.original_faculty_id !== row.assigned_faculty_id;
          const s = row.is_cancelled ? 'cancelled' : execMap[row.id]?.faculty_status ?? 'not_marked';
          const cname = cName(row.course);
          const sub = isReplaced ? row.csf?.subject?.subject_name ?? '—' : row.subject?.subject_name ?? '—';
          const fac = row.assigned_faculty?.full_name ?? '—';
          const STATUS_LBL: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked', cancelled: 'CANCELLED' };
          const lbl = row.is_cancelled ? 'CANCELLED' : STATUS_LBL[s] ?? 'Not Marked';
          rowData.push(`${cname}\n${sub}\nProf. ${fac}\n[${lbl}]`);
        });
        body.push(rowData);
      }
    });

    const statusFill: Record<string, number[]> = {
      on_time: [212, 247, 231], late: [255, 243, 205], not_engaged: [253, 232, 234], not_marked: [240, 240, 240], cancelled: [230, 230, 230],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head, body, startY: 330, theme: 'grid',
      styles: { fontSize: 14, cellPadding: 16, valign: 'middle', halign: 'center', overflow: 'linebreak', lineColor: [180, 180, 180], lineWidth: 1 },
      headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold', fontSize: 16, halign: 'center' },
      columnStyles: { 0: { cellWidth: 160, fontStyle: 'bold' } },
      margin: { top: 330, left: 80, right: 80, bottom: 80 },
      tableWidth: 'auto',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell(data: any) {
        if (data.section === 'body' && data.column.index > 0 && data.cell.raw) {
          const text = String(data.cell.raw.content || data.cell.raw);
          if (!text) return;
          let fill = [255, 255, 255];
          if (text.includes('[On Time]')) fill = statusFill.on_time;
          else if (text.includes('[Late]')) fill = statusFill.late;
          else if (text.includes('[Not Engaged]')) fill = statusFill.not_engaged;
          else if (text.includes('[Not Marked]')) fill = statusFill.not_marked;
          else if (text.includes('[CANCELLED]')) fill = statusFill.cancelled;
          if (!text.includes('Lunch Break') && !text.includes('Recess') && text !== '-') {
            data.cell.styles.fillColor = fill;
          }
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawPage(data: any) {
        const cx = pageW / 2;
        doc.setFont('times', 'bold'); doc.setFontSize(46); doc.setTextColor(26, 34, 68);
        doc.text('B. K. Birla College, Kalyan', cx, 100, { align: 'center' });
        doc.setFont('times', 'normal'); doc.setFontSize(26); doc.setTextColor(50, 60, 90);
        doc.text('(Empowered Autonomous Status)', cx, 140, { align: 'center' });
        doc.setFont('times', 'bolditalic'); doc.setFontSize(30);
        doc.text('Department of Management Studies', cx, 185, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.setTextColor(26, 34, 68);
        doc.text('Daily Execution Report', cx, 250, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(22); doc.setTextColor(90, 100, 120);
        doc.text(`Date: ${dtStr}`, cx, 290, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(16); doc.setTextColor(120);
        doc.text(`Report Generated By: ${generatedBy}`, 80, pageH - 40);
        doc.text(`Report Generated On: ${new Date().toLocaleString('en-IN')}`, 80, pageH - 20);
        doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 20, { align: 'center' });
      },
    });

    if (virtualEntries.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vStartY = (doc as any).lastAutoTable.finalY + 40;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(26, 34, 68);
      doc.text('Virtual lecture', 80, vStartY);

      const STATUS_LBL: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };
      const vBody = virtualEntries.map((row) => {
        const c = cName(row.course);
        if (row.is_cancelled) return [c, 'CANCELLED', '-', 'CANCELLED'];
        const isReplaced = row.is_rescheduled && row.original_faculty_id !== row.assigned_faculty_id;
        const sub = isReplaced ? row.csf?.subject?.subject_name ?? '—' : row.subject?.subject_name ?? '—';
        const fac = row.assigned_faculty?.full_name ?? '—';
        const s = execMap[row.id]?.faculty_status ?? 'not_marked';
        return [c, sub, `Prof. ${fac}`, `[${STATUS_LBL[s] ?? 'Not Marked'}]`];
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Course', 'Subject', 'Faculty', 'Status']],
        body: vBody,
        startY: vStartY + 20,
        theme: 'grid',
        styles: { fontSize: 16, cellPadding: 12, valign: 'middle', lineColor: [180, 180, 180], lineWidth: 1 },
        headStyles: { fillColor: [240, 240, 245], textColor: [26, 34, 68], fontStyle: 'bold', fontSize: 18, halign: 'left' },
        margin: { left: 80, right: 80, bottom: 80 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell(data: any) {
          if (data.section === 'body' && data.column.index === 3 && data.cell.raw) {
            const text = String(data.cell.raw);
            let fill = [255, 255, 255];
            if (text.includes('[On Time]')) fill = statusFill.on_time;
            else if (text.includes('[Late]')) fill = statusFill.late;
            else if (text.includes('[Not Engaged]')) fill = statusFill.not_engaged;
            else if (text.includes('[Not Marked]')) fill = statusFill.not_marked;
            data.cell.styles.fillColor = fill;
          }
        },
      });
    }

    doc.save(`Execution_Log_${currentDate}.pdf`);
  }

  const colCount = 1 + rooms.length;
  const gridStyle = { gridTemplateColumns: `86px repeat(${rooms.length},minmax(108px,1fr))` };

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Execution Log</h1>
          <p className="page-subtitle">Click any lecture cell to cycle through status — changes save instantly</p>
        </div>
      </div>

      <div className="content">
        <div className="controls-bar">
          <div className="controls-group">
            <div className="field">
              <label>Date</label>
              <input ref={dateInputRef} type="text" style={{ width: 160 }} readOnly />
            </div>
            <button className="btn btn-primary" style={{ height: 38 }} disabled={loadingBtn} onClick={() => loadDay()}>
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: '#fff', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Load Day
            </button>
          </div>
          <div className="controls-group" style={{ gap: '0.75rem' }}>
            <button className="btn-export" onClick={handleExportExcel}>Excel</button>
            <button className="btn-export" onClick={handleExportPdf}>PDF</button>
          </div>
        </div>

        {showStats && (
          <>
            <div className="stat-chips">
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--success)' }} /><strong>{stats.onTime}</strong>&nbsp;On Time</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--warn)' }} /><strong>{stats.late}</strong>&nbsp;Late</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--error)' }} /><strong>{stats.notEngaged}</strong>&nbsp;Not Engaged</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--text-muted)' }} /><strong>{stats.notMarked}</strong>&nbsp;Not Marked</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--text-muted)', opacity: 0.4 }} /><strong>{stats.cancelled}</strong>&nbsp;Cancelled</div>
            </div>
            <div className="legend">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '0.25rem' }}>Click to cycle:</span>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(62,207,142,.1)', borderColor: 'var(--success)' }} />On Time</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(245,166,35,.1)', borderColor: 'var(--warn)' }} />Late</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(224,92,107,.12)', borderColor: 'var(--error)' }} />Not Engaged</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(79, 106, 245, 0.03)', borderColor: 'var(--border)' }} />Not Marked</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(107,112,137,.07)', borderColor: 'var(--text-muted)' }} />Cancelled (not clickable)</div>
            </div>
          </>
        )}

        <div style={{ overflowX: 'auto' }}>
          {gridState !== 'ready' ? (
            <div className="tt-grid">
              <div className="grid-placeholder">
                {gridState === 'loading' ? (
                  <span className="spin" style={{ display: 'inline-block', width: 24, height: 24, borderWidth: 3 }} />
                ) : (
                  <svg viewBox="0 0 24 24"><polyline points="9,11 12,14 22,4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                )}
                <div>{gridState === 'loading' ? 'Loading…' : emptyMsg}</div>
              </div>
            </div>
          ) : (
            <div className="tt-grid" style={{ marginBottom: 0 }}>
              <div className="tt-head" style={gridStyle}>
                <div className="th-cell">Time</div>
                {rooms.map((r) => <div className="th-cell" key={r.id}>Room {r.room_code}</div>)}
              </div>
              {timeSlots.map((slot) => {
                const isBreak = slot.slot_type !== 'lecture';
                return (
                  <div key={slot.id} className={`tt-row${isBreak ? ' is-break' : ''}`} style={gridStyle}>
                    <div className="time-cell">
                      <span className="tl">{slot.slot_label ?? ''}</span>
                      <span className="tr">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span>
                    </div>
                    {isBreak ? (
                      <div className="break-span" style={{ gridColumn: `2/${colCount + 1}` }}>
                        {slot.slot_type === 'lunch' ? '🍽 Lunch' : '☕ Recess'}
                      </div>
                    ) : (
                      rooms.map((room) => renderCell(scheduleMap[slot.id]?.[room.id], false))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {gridState === 'ready' && (
          <div className="virtual-section" style={{ display: 'block' }}>
            <div className="virtual-header">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Virtual lecture
            </div>
            <div className="virtual-grid">
              {!virtualRoomId ? (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Virtual room not configured. Contact Administrator.</div>
              ) : virtualEntries.length === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No virtual lectures scheduled for this date.</div>
              ) : (
                virtualEntries.map((row) => renderCell(row, true))
              )}
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
