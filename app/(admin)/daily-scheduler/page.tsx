'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';
import { preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import './scheduler.css';

interface TimeSlot {
  id: string;
  slot_label: string | null;
  start_time: string;
  end_time: string;
  slot_type: 'lecture' | 'recess' | 'lunch';
  sort_order: number;
}
interface RoomRef { id: string; room_code: string }
interface CourseRef { id: string; year: string; program: string; division: string | null }
interface FacultyRef { id: string; full_name: string }
interface ScheduleRow {
  id: string;
  is_cancelled: boolean;
  cancel_reason: string | null;
  is_rescheduled: boolean;
  original_faculty_id: string | null;
  time_slot_id: string | null;
  room_id: string;
  course_id: string;
  virtual_start_time: string | null;
  virtual_end_time: string | null;
  time_slot: TimeSlot | null;
  room: RoomRef | null;
  course: CourseRef | null;
  subject: { id: string; subject_name: string } | null;
  assigned_faculty: FacultyRef | null;
  original_faculty: FacultyRef | null;
  csf: { subject: { subject_name: string } | null } | null;
}
type ScheduleMap = Record<string, Record<string, ScheduleRow>>;
interface RemarkRow {
  id: string;
  start_time: string | null;
  end_time: string | null;
  remark: string;
  faculty: { id: string; full_name: string } | null;
}
interface CSFOption {
  csfId: string;
  subjectId: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  warnAbsent: boolean;
  warnBusy: boolean;
}
interface ActiveCell {
  scheduleId: string | null;
  tsId: string | null;
  roomId: string;
  courseId: string;
  row: ScheduleRow | null;
  isVirtual: boolean;
  state: 'empty' | 'absent' | 'warn' | 'resolved' | 'cancelled' | 'normal';
  time: string;
  rcode: string;
}

const DAY_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function localDateStr(d?: Date) {
  const dt = d ?? new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function getDayType(ds: string) {
  return DAY_MAP[new Date(ds + 'T00:00:00').getDay()];
}
function slotDayType(day: string) {
  return day === 'saturday' ? 'saturday' : 'weekday';
}
function courseName(c: CourseRef | null | undefined) {
  if (!c) return '—';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}

export default function DailySchedulerPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [selectedDate, setSelectedDate] = useState(localDateStr());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<RoomRef[]>([]);
  const [scheduleMap, setScheduleMap] = useState<ScheduleMap>({});
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [remarksData, setRemarksData] = useState<RemarkRow[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyRef[]>([]);
  const [virtualRoomId, setVirtualRoomId] = useState<string | null>(null);
  const [gridState, setGridState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [emptyMsg, setEmptyMsg] = useState('Pick a date and click Create Schedule');
  const [dangerBar, setDangerBar] = useState(false);
  const [showPanels, setShowPanels] = useState(false);
  const [generatedBy, setGeneratedBy] = useState('Admin');
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [generateTypeOpen, setGenerateTypeOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [cellModalOpen, setCellModalOpen] = useState(false);

  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [courses, setCourses] = useState<CourseRef[]>([]);
  const [pickedCourseId, setPickedCourseId] = useState('');
  const [csfOptions, setCsfOptions] = useState<CSFOption[]>([]);
  const [csfLoading, setCsfLoading] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState<CSFOption | null>(null);
  const [virtualStart, setVirtualStart] = useState('');
  const [virtualEnd, setVirtualEnd] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [remarkFaculty, setRemarkFaculty] = useState('');
  const [remarkStart, setRemarkStart] = useState('');
  const [remarkEnd, setRemarkEnd] = useState('');
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  useEffect(() => {
    preloadLogoForPDF();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        setUserId(authData.user.id);
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
        setSelectedDate(ds);
        autoLoadIfExists(ds);
      },
    });
    return () => fp.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hideAllUI() {
    setDangerBar(false);
    setShowPanels(false);
  }
  function gridEmpty(msg: string) {
    setGridState('idle');
    setEmptyMsg(msg);
  }
  function gridLoading() {
    setGridState('loading');
  }

  async function autoLoadIfExists(dateArg?: string) {
    const checkDate = dateArg ?? selectedDate;
    const dayType = getDayType(checkDate);

    setTimeSlots([]);
    setRooms([]);
    setScheduleMap({});
    setRemarksData([]);

    if (dayType === 'sunday') {
      hideAllUI();
      gridEmpty('No schedule on Sundays.');
      return;
    }

    const { data: hol } = await supabase.from('holidays').select('name').eq('holiday_date', checkDate).maybeSingle();
    if (hol) {
      hideAllUI();
      gridEmpty(`🎉 Holiday: ${hol.name}. No schedule for this day.`);
      return;
    }

    const { data } = await supabase.from('daily_schedule').select('id').eq('schedule_date', checkDate).limit(1);
    if (data && data.length > 0) {
      setDangerBar(true);
      await loadSchedule(checkDate);
    } else {
      hideAllUI();
      gridEmpty('No schedule for this date. Click Create Schedule to generate.');
    }
  }

  async function loadSchedule(dateArg?: string) {
    const date = dateArg ?? selectedDate;
    gridLoading();
    try {
      const dayType = getDayType(date);
      const [sR, rR, scR, lR, remR, facR] = await Promise.all([
        supabase.from('time_slots').select('id,slot_label,start_time,end_time,slot_type,sort_order').eq('day_type', slotDayType(dayType)).order('sort_order'),
        supabase.from('rooms').select('id,room_code').eq('is_active', true).order('room_code'),
        supabase
          .from('daily_schedule')
          .select(
            `id,is_cancelled,cancel_reason,is_rescheduled,original_faculty_id,
             time_slot_id,room_id,course_id,virtual_start_time,virtual_end_time,
             time_slot:time_slots(id,slot_label,start_time,end_time,slot_type,sort_order),
             room:rooms(id,room_code),
             course:courses(id,course_code,year,program,division),
             subject:subjects(id,subject_name),
             assigned_faculty:faculty!assigned_faculty_id(id,full_name),
             original_faculty:faculty!original_faculty_id(id,full_name),
             csf:course_subject_faculty!csf_id(subject:subjects(subject_name))`
          )
          .eq('schedule_date', date),
        supabase.from('faculty_leaves').select('faculty_id').eq('leave_date', date).eq('status', 'approved'),
        supabase.from('faculty_remarks').select('id, start_time, end_time, remark, faculty:faculty!faculty_id(id, full_name)').eq('date', date).order('start_time', { ascending: true }),
        supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name'),
      ]);
      if (sR.error) throw sR.error;
      if (rR.error) throw rR.error;
      if (scR.error) throw scR.error;

      const ts = sR.data ?? [];
      const aIds = new Set((lR.data ?? []).map((l) => l.faculty_id));
      const remarks = (remR.data as unknown as RemarkRow[]) ?? [];
      const faculty = facR.data ?? [];

      let vRoomId: string | null = null;
      const physicalRooms = (rR.data ?? []).filter((r) => {
        if (r.room_code?.toUpperCase() === 'VIRTUAL') {
          vRoomId = r.id;
          return false;
        }
        return true;
      });

      const sMap: ScheduleMap = {};
      for (const row of (scR.data as unknown as ScheduleRow[]) ?? []) {
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

      setTimeSlots(ts);
      setAbsentIds(aIds);
      setRemarksData(remarks);
      setAllFaculty(faculty);
      setVirtualRoomId(vRoomId);
      setRooms(physicalRooms);
      setScheduleMap(sMap);
      setGridState('ready');
      setShowPanels(true);
    } catch (e) {
      toast((e as Error).message, 'error');
      gridEmpty('Failed to load.');
    }
  }

  useEffect(() => {
    autoLoadIfExists(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateOrLoad(force = false, mode: 'master' | 'blank' = 'master') {
    setGenerating(true);
    gridLoading();
    try {
      const { data: existing } = await supabase.from('daily_schedule').select('id').eq('schedule_date', selectedDate).limit(1);
      const exists = existing && existing.length > 0;
      if (exists && !force) {
        await loadSchedule();
        setDangerBar(true);
        toast('Schedule loaded.', 'success');
        return;
      }
      if (force && exists) {
        const { error: de } = await supabase.from('daily_schedule').delete().eq('schedule_date', selectedDate);
        if (de) throw de;
      }
      const dayType = getDayType(selectedDate);
      if (dayType === 'sunday') {
        toast('No schedule on Sundays.', 'warn');
        gridEmpty('No schedule on Sundays.');
        return;
      }
      const { data: hol } = await supabase.from('holidays').select('name').eq('holiday_date', selectedDate).maybeSingle();
      if (hol) {
        toast(`${selectedDate} is a holiday: ${hol.name}. Cannot generate schedule.`, 'warn');
        gridEmpty(`🎉 Holiday: ${hol.name}. No schedule for this day.`);
        setDangerBar(false);
        return;
      }

      if (mode === 'master') {
        const { data: master, error: me } = await supabase
          .from('master_timetable')
          .select('id,time_slot_id,room_id,course_id,subject_id,csf_id,faculty_id,virtual_start_time,virtual_end_time')
          .eq('day_type', dayType)
          .eq('is_active', true);
        if (me) throw me;
        if (!master || !master.length) {
          toast('No master timetable found for this day type.', 'warn');
          gridEmpty('No master timetable entries. Set up the Master Timetable first.');
          return;
        }
        const { error: ie } = await supabase.from('daily_schedule').insert(
          master.map((r) => ({
            schedule_date: selectedDate,
            master_entry_id: r.id,
            time_slot_id: r.time_slot_id,
            room_id: r.room_id,
            course_id: r.course_id,
            subject_id: r.subject_id,
            csf_id: r.csf_id,
            assigned_faculty_id: r.faculty_id,
            original_faculty_id: r.faculty_id,
            virtual_start_time: r.virtual_start_time,
            virtual_end_time: r.virtual_end_time,
            is_rescheduled: false,
            is_cancelled: false,
            generated_by: userId,
          }))
        );
        if (ie) throw ie;
        toast('Schedule imported from master.', 'success');
      } else {
        toast('Blank schedule created.', 'success');
      }
      await loadSchedule();
      setDangerBar(true);
    } catch (e) {
      toast((e as Error).message, 'error');
      gridEmpty('Failed: ' + (e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function isDoublebooked(fId: string, tsId: string, excludeId: string) {
    for (const [t, rm] of Object.entries(scheduleMap)) {
      if (t !== tsId) continue;
      for (const row of Object.values(rm)) {
        if (row.id === excludeId) continue;
        if (!row.is_cancelled && row.assigned_faculty?.id === fId) return true;
      }
    }
    return false;
  }

  function getRowState(row: ScheduleRow, slotId: string | null): ActiveCell['state'] {
    if (row.is_cancelled) return 'cancelled';
    const origFId = row.original_faculty?.id;
    const currFId = row.assigned_faculty?.id;
    const isReplaced = row.is_rescheduled && origFId !== currFId;
    if (isReplaced) return 'resolved';
    if (origFId && absentIds.has(origFId)) return 'absent';
    if (currFId && slotId && isDoublebooked(currFId, slotId, row.id)) return 'warn';
    return 'normal';
  }

  const virtualEntries = scheduleMap['null'] ? Object.values(scheduleMap['null']) : [];

  const stats = (() => {
    let needsAttention = 0, resolved = 0, cancelled = 0, warn = 0, total = 0;
    for (const [tsId, rm] of Object.entries(scheduleMap)) {
      const slot = timeSlots.find((s) => s.id === tsId);
      if (tsId !== 'null' && slot?.slot_type !== 'lecture') continue;
      for (const row of Object.values(rm)) {
        total++;
        if (row.is_cancelled) { cancelled++; continue; }
        if (row.is_rescheduled) { resolved++; continue; }
        const fId = row.original_faculty?.id;
        if (fId && absentIds.has(fId)) needsAttention++;
        else if (tsId !== 'null' && fId && isDoublebooked(fId, tsId, row.id)) warn++;
      }
    }
    return { needsAttention, resolved, cancelled, warn, total };
  })();

  async function openModal(row: ScheduleRow | undefined, slot: TimeSlot | null, room: RoomRef, isVirtual: boolean) {
    setSelectedOpt(null);
    setCancelReason('');
    setPickedCourseId('');
    setCsfOptions([]);

    const state = row ? getRowState(row, slot?.id ?? null) : 'empty';
    const cell: ActiveCell = {
      scheduleId: row?.id ?? null,
      tsId: isVirtual ? null : slot?.id ?? null,
      roomId: room.id,
      courseId: row?.course_id ?? '',
      row: row ?? null,
      isVirtual,
      state,
      time: slot ? `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}` : 'VIRTUAL LECTURE',
      rcode: room.room_code,
    };
    setActiveCell(cell);

    if (isVirtual) {
      setVirtualStart(row?.virtual_start_time || '');
      setVirtualEnd(row?.virtual_end_time || '');
    }

    if (!row) {
      const { data: cs } = await supabase.from('courses').select('id,year,program,division').eq('is_active', true).order('year').order('program');
      setCourses(cs ?? []);
    } else if (!row.is_cancelled) {
      await fillOptions(row.course_id, cell.tsId);
    }

    setCellModalOpen(true);
  }

  function closeModal() {
    setCellModalOpen(false);
    setActiveCell(null);
    setSelectedOpt(null);
  }

  async function handleCoursePickChange(courseId: string) {
    setPickedCourseId(courseId);
    if (activeCell) setActiveCell({ ...activeCell, courseId });
    if (!courseId) return;
    await fillOptions(courseId, activeCell?.tsId ?? null);
  }

  async function fillOptions(courseId: string, tsId: string | null) {
    setCsfLoading(true);
    setCsfOptions([]);
    try {
      const { data: csf, error } = await supabase
        .from('course_subject_faculty')
        .select('id,faculty_id,subject_id,subject:subjects!subject_id(id,subject_name),faculty:faculty!faculty_id(id,full_name)')
        .eq('course_id', courseId)
        .eq('is_active', true);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const csfRows = (csf as any[]) ?? [];
      if (!csfRows.length) {
        setCsfOptions([]);
        return;
      }

      const isVirtual = tsId === null;
      let busyIds = new Set<string>();
      if (!isVirtual) {
        const { data: busy } = await supabase.from('daily_schedule').select('assigned_faculty_id').eq('schedule_date', selectedDate).eq('time_slot_id', tsId).eq('is_cancelled', false);
        busyIds = new Set((busy ?? []).map((s) => s.assigned_faculty_id));
      }
      const { data: leaves } = await supabase.from('faculty_leaves').select('faculty_id').eq('leave_date', selectedDate).eq('status', 'approved');
      const absSet = new Set((leaves ?? []).map((l) => l.faculty_id));

      const opts: CSFOption[] = csfRows.map((r) => ({
        csfId: r.id,
        subjectId: r.subject_id,
        subjectName: r.subject.subject_name,
        facultyId: r.faculty_id,
        facultyName: r.faculty.full_name,
        warnAbsent: absSet.has(r.faculty_id),
        warnBusy: busyIds.has(r.faculty_id),
      }));
      setCsfOptions(opts);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCsfLoading(false);
    }
  }

  function buildInfo(row: ScheduleRow) {
    const isReplaced = row.is_rescheduled && row.original_faculty?.id !== row.assigned_faculty?.id;
    if (isReplaced) {
      return (
        <>
          <span className="info-lbl">Course</span><span className="info-val">{courseName(row.course)}</span>
          <span className="info-lbl">Original</span><span className="info-val" style={{ color: 'var(--error)', textDecoration: 'line-through' }}>{row.subject?.subject_name} (Prof. {row.original_faculty?.full_name})</span>
          <span className="info-lbl">Replaced By</span><span className="info-val" style={{ color: 'var(--success)', fontWeight: 'bold' }}>{row.csf?.subject?.subject_name} (Prof. {row.assigned_faculty?.full_name})</span>
        </>
      );
    }
    return (
      <>
        <span className="info-lbl">Course</span><span className="info-val">{courseName(row.course)}</span>
        <span className="info-lbl">Subject</span><span className="info-val">{row.subject?.subject_name ?? '—'}</span>
        <span className="info-lbl">Faculty</span><span className="info-val">{row.original_faculty?.full_name ?? '—'}</span>
        <span className="info-lbl">Status</span><span className="info-val">{row.is_cancelled ? '🚫 Cancelled' : absentIds.has(row.original_faculty?.id ?? '') ? '⚠ Faculty Absent' : '✓ Normal'}</span>
      </>
    );
  }

  async function handleSave() {
    if (!activeCell) return;
    const isVirtual = activeCell.tsId === null && activeCell.isVirtual;

    if (!activeCell.scheduleId && !selectedOpt) { toast('Please select a subject & faculty.', 'warn'); return; }
    if (!activeCell.courseId) { toast('Please select a course.', 'warn'); return; }

    const vStart = isVirtual ? virtualStart || null : null;
    const vEnd = isVirtual ? virtualEnd || null : null;

    setSaving(true);
    try {
      if (activeCell.scheduleId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = { is_cancelled: false, cancel_reason: null };
        if (selectedOpt) {
          payload.csf_id = selectedOpt.csfId;
          payload.assigned_faculty_id = selectedOpt.facultyId;
          payload.is_rescheduled = true;
        }
        if (isVirtual) {
          payload.virtual_start_time = vStart;
          payload.virtual_end_time = vEnd;
        }
        const { error } = await supabase.from('daily_schedule').update(payload).eq('id', activeCell.scheduleId);
        if (error) throw error;

        if (selectedOpt) {
          const { error: execErr } = await supabase.from('lecture_execution').upsert(
            {
              daily_schedule_id: activeCell.scheduleId,
              schedule_date: selectedDate,
              faculty_status: 'not_marked',
              actual_faculty_id: selectedOpt.facultyId,
              replacement_faculty_id: selectedOpt.facultyId,
              is_replaced: true,
              marked_by: userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'daily_schedule_id' }
          );
          if (execErr) throw execErr;
        }
      } else {
        if (!selectedOpt) { toast('Please select a subject & faculty.', 'warn'); setSaving(false); return; }
        const { error } = await supabase.from('daily_schedule').insert({
          schedule_date: selectedDate,
          time_slot_id: activeCell.tsId || null,
          room_id: activeCell.roomId,
          course_id: activeCell.courseId,
          subject_id: selectedOpt.subjectId,
          csf_id: selectedOpt.csfId,
          assigned_faculty_id: selectedOpt.facultyId,
          original_faculty_id: selectedOpt.facultyId,
          virtual_start_time: vStart,
          virtual_end_time: vEnd,
          is_rescheduled: false,
          is_cancelled: false,
          generated_by: userId,
        });
        if (error) throw error;
      }
      toast('Saved.', 'success');
      closeModal();
      await loadSchedule();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLecture() {
    if (!activeCell?.scheduleId) return;
    if (!confirm('Delete this lecture completely? The cell will become empty and can be reassigned.')) return;
    try {
      const { error } = await supabase.from('daily_schedule').delete().eq('id', activeCell.scheduleId);
      if (error) throw error;
      toast('Lecture deleted.', 'warn');
      closeModal();
      await loadSchedule();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function handleCancelSlot() {
    if (!activeCell?.scheduleId) return;
    try {
      const { error } = await supabase.from('daily_schedule').update({ is_cancelled: true, cancel_reason: cancelReason.trim() || null }).eq('id', activeCell.scheduleId);
      if (error) throw error;
      toast('Slot cancelled.', 'warn');
      closeModal();
      await loadSchedule();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function handleUncancelSlot() {
    if (!activeCell?.scheduleId) return;
    try {
      const { error } = await supabase.from('daily_schedule').update({ is_cancelled: false, cancel_reason: null }).eq('id', activeCell.scheduleId);
      if (error) throw error;
      toast('Slot restored.', 'success');
      closeModal();
      await loadSchedule();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function openRemarkModal() {
    setRemarkFaculty('');
    setRemarkStart('');
    setRemarkEnd('');
    setRemarkText('');
    setRemarkOpen(true);
  }
  async function saveRemark() {
    if (!remarkFaculty || !remarkStart || !remarkEnd || !remarkText.trim()) {
      toast('Please fill all fields', 'warn');
      return;
    }
    setRemarkSaving(true);
    try {
      const { error } = await supabase.from('faculty_remarks').insert({
        date: selectedDate,
        faculty_id: remarkFaculty,
        start_time: remarkStart,
        end_time: remarkEnd,
        remark: remarkText.trim(),
      });
      if (error) throw error;
      toast('Remark added successfully', 'success');
      setRemarkOpen(false);
      await loadSchedule();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRemarkSaving(false);
    }
  }
  async function deleteRemark(id: string) {
    if (!confirm('Are you sure you want to delete this remark?')) return;
    try {
      const { error } = await supabase.from('faculty_remarks').delete().eq('id', id);
      if (error) throw error;
      toast('Remark deleted successfully', 'success');
      await loadSchedule();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function renderCell(row: ScheduleRow | undefined, slot: TimeSlot | null, room: RoomRef, isVirtual: boolean) {
    if (!row) {
      if (isVirtual) {
        return (
          <div key="add-virtual" className="virtual-cell empty" onClick={() => openModal(undefined, null, room, true)}>
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.2 }}>Add more<br />Lecture</div>
          </div>
        );
      }
      return <div key={room.id} className="lc s-empty" onClick={() => openModal(undefined, slot, room, false)}><div className="lc-add"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></div></div>;
    }

    const state = getRowState(row, slot?.id ?? null);
    const timeDisplay = row.virtual_start_time && row.virtual_end_time && (
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 3, fontWeight: 600 }}>{row.virtual_start_time.slice(0, 5)} - {row.virtual_end_time.slice(0, 5)}</div>
    );

    const badgeMap: Record<string, ReactNode> = {
      absent: <span className="lc-badge absent">⚠ ABSENT</span>,
      warn: <span className="lc-badge warn">⚠ DOUBLE</span>,
      cancelled: <span className="lc-badge cancelled">CANCELLED</span>,
      normal: null,
      resolved: null,
      empty: null,
    };

    if (state === 'resolved') {
      const origSub = row.subject?.subject_name ?? '—';
      const origFac = row.original_faculty?.full_name ?? '—';
      const newSub = row.csf?.subject?.subject_name ?? '—';
      const newFac = row.assigned_faculty?.full_name ?? '—';
      return (
        <div key={row.id} className={isVirtual ? 'virtual-cell filled s-resolved' : 'lc s-resolved'} onClick={() => openModal(row, slot, room, isVirtual)}>
          {timeDisplay}
          <div className="lc-course">{courseName(row.course)}</div>
          <div style={{ borderBottom: '1px dashed rgba(62,207,142,.4)', paddingBottom: 3, marginBottom: 3 }}>
            <div className="lc-subject" style={{ fontSize: '.65rem', color: 'var(--error)', textDecoration: 'line-through' }}>{origSub}</div>
            <div className="lc-faculty" style={{ fontSize: '.6rem', color: 'var(--error)', textDecoration: 'line-through' }}>Prof. {origFac}</div>
          </div>
          <div className="lc-subject">{newSub}</div>
          <div className="lc-faculty" style={{ color: 'var(--success)', fontWeight: 600 }}>Prof. {newFac}</div>
          <span className="lc-badge resolved" style={isVirtual ? { position: 'absolute', top: '0.5rem', right: '0.5rem' } : undefined}>✓ REPLACED</span>
        </div>
      );
    }

    return (
      <div key={row.id} className={`${isVirtual ? 'virtual-cell filled' : 'lc'} s-${state}`} onClick={() => openModal(row, slot, room, isVirtual)}>
        {timeDisplay}
        <div className="lc-course">{courseName(row.course)}</div>
        <div className="lc-subject">{row.subject?.subject_name ?? '—'}</div>
        <div className="lc-faculty">Prof. {row.original_faculty?.full_name ?? '—'}</div>
        {badgeMap[state]}
      </div>
    );
  }

  async function handleExportExcel() {
    if (!timeSlots.length || !rooms.length || Object.keys(scheduleMap).length === 0) return toast('No schedule data to export', 'error');
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
        const row1 = [timeLabel], row2 = [''], row3 = [''];
        rooms.forEach((room) => {
          const row = scheduleMap[slot.id]?.[room.id];
          if (row) {
            if (row.is_cancelled) {
              row1.push('CANCELLED'); row2.push(row.cancel_reason || ''); row3.push('');
            } else {
              const isReplaced = row.is_rescheduled && row.original_faculty?.id !== row.assigned_faculty?.id;
              const c = courseName(row.course);
              if (isReplaced) {
                const origS = row.subject?.subject_name || '-';
                const origF = row.original_faculty?.full_name || '-';
                const newS = row.csf?.subject?.subject_name || '-';
                const newF = row.assigned_faculty?.full_name || '-';
                row1.push(c); row2.push(`[${origS}] -> ${newS}`); row3.push(`[${origF} Absent] -> ${newF}`);
              } else {
                const s = row.subject?.subject_name || '-';
                let f = row.original_faculty?.full_name || '-';
                if (row.original_faculty && absentIds.has(row.original_faculty.id)) f += ' (ABSENT)';
                row1.push(c); row2.push(s); row3.push(f);
              }
            }
          } else { row1.push('-'); row2.push(''); row3.push(''); }
        });
        wsData.push(row1, row2, row3);
        merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex + 2, c: 0 } });
        rowIndex += 3;
      }
    });

    if (virtualEntries.length > 0) {
      wsData.push([]); wsData.push(['Virtual lecture', '', '', '']); wsData.push(['Time', 'Course', 'Subject', 'Faculty']);
      virtualEntries.forEach((row) => {
        const vt = row.virtual_start_time && row.virtual_end_time ? `${row.virtual_start_time.slice(0, 5)} - ${row.virtual_end_time.slice(0, 5)}` : 'Flexible';
        const c = courseName(row.course);
        if (row.is_cancelled) { wsData.push([vt, c, 'CANCELLED', row.cancel_reason || '-']); return; }
        const isReplaced = row.is_rescheduled && row.original_faculty?.id !== row.assigned_faculty?.id;
        if (isReplaced) {
          wsData.push([vt, c, `[${row.subject?.subject_name || ''}] -> ${row.csf?.subject?.subject_name || ''}`, `[${row.original_faculty?.full_name || ''} Absent] -> ${row.assigned_faculty?.full_name || ''}`]);
        } else {
          let f = row.original_faculty?.full_name || '';
          if (row.original_faculty && absentIds.has(row.original_faculty.id)) f += ' (ABSENT)';
          wsData.push([vt, c, row.subject?.subject_name || '-', f]);
        }
      });
    }

    if (remarksData.length > 0) {
      wsData.push([]); wsData.push(['Remarks & Extra Activities', '', '']); wsData.push(['Time', 'Faculty Name', 'Remark / Activity Details']);
      remarksData.forEach((r) => {
        wsData.push([`${r.start_time ? r.start_time.slice(0, 5) : ''} - ${r.end_time ? r.end_time.slice(0, 5) : ''}`, r.faculty?.full_name || 'Unknown', r.remark]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, ...rooms.map(() => ({ wch: 30 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Schedule');
    XLSX.writeFile(wb, `Daily_Schedule_${selectedDate}.xlsx`);
  }

  async function handleExportPdf() {
    if (!timeSlots.length || !rooms.length || Object.keys(scheduleMap).length === 0) return toast('No schedule data to export', 'error');
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a0' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    const headRow = ['Time', ...rooms.map((r) => `Room ${r.room_code}`)];
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
          if (row) {
            if (row.is_cancelled) {
              rowData.push({ content: `CANCELLED\n${row.cancel_reason || ''}`, styles: { halign: 'center', valign: 'middle', textColor: [150, 150, 150] } });
            } else {
              const isReplaced = row.is_rescheduled && row.original_faculty?.id !== row.assigned_faculty?.id;
              const c = courseName(row.course);
              if (isReplaced) {
                const origS = row.subject?.subject_name || '';
                const origF = row.original_faculty?.full_name || '';
                const newS = row.csf?.subject?.subject_name || '';
                const newF = row.assigned_faculty?.full_name || '';
                rowData.push({ content: `${c}\n\n[Original/Absent]\n${origS}\n${origF}\n\n[Replaced By]\n${newS}\n${newF}`, styles: { halign: 'center', valign: 'middle', textColor: [40, 40, 40], fontSize: 10 } });
              } else {
                const s = row.subject?.subject_name || '';
                const f = row.original_faculty?.full_name || '';
                rowData.push({ content: `${c}\n${s}\n${f}`, styles: { halign: 'center', valign: 'middle', textColor: [40, 40, 40] } });
              }
            }
          } else {
            rowData.push({ content: '-', styles: { halign: 'center', valign: 'middle', textColor: [200, 200, 200] } });
          }
        });
        body.push(rowData);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head: [headRow], body, startY: 330, theme: 'grid',
      styles: { fontSize: 14, cellPadding: 16, valign: 'middle', halign: 'center', overflow: 'linebreak', lineColor: [180, 180, 180], lineWidth: 1 },
      headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold', fontSize: 16, halign: 'center' },
      columnStyles: { 0: { cellWidth: 160, fontStyle: 'bold' } },
      margin: { top: 330, left: 80, right: 80, bottom: 80 }, tableWidth: 'auto',
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
        doc.text('Daily Schedule', cx, 250, { align: 'center' });
        const dtStr = new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(22); doc.setTextColor(90, 100, 120);
        doc.text(`Date: ${dtStr}`, cx, 290, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(16); doc.setTextColor(120);
        doc.text(`Report Generated By: ${generatedBy}`, 80, pageH - 40);
        doc.text(`Report Generated On: ${new Date().toLocaleString('en-IN')}`, 80, pageH - 20);
        doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 20, { align: 'center' });
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentY = (doc as any).lastAutoTable.finalY + 40;

    if (virtualEntries.length > 0) {
      if (currentY > pageH - 200) { doc.addPage(); currentY = 80; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(26, 34, 68);
      doc.text('Virtual lecture', 80, currentY);

      const vBody = virtualEntries.map((row) => {
        const vt = row.virtual_start_time && row.virtual_end_time ? `${row.virtual_start_time.slice(0, 5)} - ${row.virtual_end_time.slice(0, 5)}` : 'Flexible';
        const c = courseName(row.course);
        if (row.is_cancelled) return [vt, c, 'CANCELLED', row.cancel_reason || '-'];
        const isReplaced = row.is_rescheduled && row.original_faculty?.id !== row.assigned_faculty?.id;
        if (isReplaced) return [vt, c, `[${row.subject?.subject_name || ''}] -> ${row.csf?.subject?.subject_name || ''}`, `[${row.original_faculty?.full_name || ''} Absent] -> ${row.assigned_faculty?.full_name || ''}`];
        let f = row.original_faculty?.full_name || '';
        if (row.original_faculty && absentIds.has(row.original_faculty.id)) f += ' (ABSENT)';
        return [vt, c, row.subject?.subject_name || '-', f];
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Time', 'Course', 'Subject', 'Faculty']], body: vBody, startY: currentY + 20, theme: 'grid',
        styles: { fontSize: 16, cellPadding: 12, valign: 'middle', lineColor: [180, 180, 180], lineWidth: 1 },
        headStyles: { fillColor: [240, 240, 245], textColor: [26, 34, 68], fontStyle: 'bold', fontSize: 18, halign: 'left' },
        margin: { left: 80, right: 80, bottom: 80 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentY = (doc as any).lastAutoTable.finalY + 40;
    }

    if (remarksData.length > 0) {
      if (currentY > pageH - 200) { doc.addPage(); currentY = 80; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(26, 34, 68);
      doc.text('Faculty Remarks & Extra Activities', 80, currentY);

      const remBody = remarksData.map((r) => [`${r.start_time ? r.start_time.slice(0, 5) : ''} - ${r.end_time ? r.end_time.slice(0, 5) : ''}`, r.faculty?.full_name || 'Unknown', r.remark]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Time', 'Faculty Name', 'Remark / Activity Details']], body: remBody, startY: currentY + 20, theme: 'grid',
        styles: { fontSize: 16, cellPadding: 12, valign: 'middle', lineColor: [180, 180, 180], lineWidth: 1 },
        headStyles: { fillColor: [240, 240, 245], textColor: [26, 34, 68], fontStyle: 'bold', fontSize: 18, halign: 'left' },
        columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 350 }, 2: { cellWidth: 'auto' } },
        margin: { left: 80, right: 80, bottom: 80 },
      });
    }

    doc.save(`Daily_Schedule_${selectedDate}.pdf`);
  }

  const colCount = 1 + rooms.length;
  const gridStyle = { gridTemplateColumns: `86px repeat(${rooms.length},minmax(108px,1fr))` };

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Daily Scheduler</h1>
          <p className="page-subtitle">Generate and manage the working schedule for any date</p>
        </div>
      </div>

      <div className="content">
        <div className="controls-bar">
          <div className="controls-group">
            <div className="field">
              <label>Schedule Date</label>
              <input ref={dateInputRef} type="text" style={{ width: 160 }} readOnly />
            </div>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={() => setGenerateTypeOpen(true)}>
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: '#fff', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <polyline points="23,4 23,10 17,10" /><path d="M20.49 15a9 9 0 1 1-.08-6.07" />
              </svg>
              Create Schedule
            </button>
            {gridState === 'ready' && (
              <button className="btn btn-ghost" style={{ height: 38 }} onClick={() => loadSchedule()}>
                <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 1 0 .08-6.07" />
                </svg>
                Reload
              </button>
            )}
          </div>
          <div className="controls-group" style={{ gap: '0.75rem' }}>
            <button className="btn-export" onClick={handleExportExcel}>Excel</button>
            <button className="btn-export" onClick={handleExportPdf}>PDF</button>
          </div>
        </div>

        {dangerBar && (
          <div className="danger-bar">
            <span>⚠ Schedule active for this date. Regenerating will delete all existing edits.</span>
            <button className="btn btn-danger btn-sm" onClick={() => setRegenOpen(true)}>Delete &amp; Regenerate</button>
          </div>
        )}

        {showPanels && (
          <>
            <div className="stat-chips">
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--error)' }} /><strong>{stats.needsAttention}</strong>&nbsp;absent</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--warn)' }} /><strong>{stats.warn}</strong>&nbsp;double-booked</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--success)' }} /><strong>{stats.resolved}</strong>&nbsp;resolved</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--text-muted)' }} /><strong>{stats.cancelled}</strong>&nbsp;cancelled</div>
              <div className="stat-chip"><span className="chip-dot" style={{ background: 'var(--accent)' }} /><strong>{stats.total}</strong>&nbsp;total</div>
            </div>
            <div className="legend">
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(224,92,107,.12)', borderColor: 'var(--error)' }} />Faculty absent</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(245,166,35,.1)', borderColor: 'var(--warn)' }} />Double-booked</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(62,207,142,.08)', borderColor: 'var(--success)' }} />Resolved</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'rgba(107,112,137,.08)', borderColor: 'var(--text-muted)' }} />Cancelled</div>
              <div className="leg-item"><div className="leg-sw" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} />Normal</div>
            </div>
          </>
        )}

        <div style={{ overflowX: 'auto' }}>
          {gridState !== 'ready' ? (
            <div className="tt-grid">
              <div className="grid-placeholder">
                {gridState === 'loading' ? <span className="spin" style={{ display: 'inline-block', width: 24, height: 24, borderWidth: 3 }} /> : <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
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
                const isB = slot.slot_type !== 'lecture';
                return (
                  <div key={slot.id} className={`tt-row${isB ? ' is-break' : ''}`} style={gridStyle}>
                    <div className="time-cell"><span className="tl">{slot.slot_label ?? ''}</span><span className="tr">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span></div>
                    {isB ? (
                      <div className="break-span" style={{ gridColumn: `2/${colCount + 1}` }}>{slot.slot_type === 'lunch' ? '🍽 Lunch' : '☕ Recess'}</div>
                    ) : (
                      rooms.map((room) => renderCell(scheduleMap[slot.id]?.[room.id], slot, room, false))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <br />

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
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Virtual room not configured in database. Contact administrator.</div>
              ) : (
                <>
                  {virtualEntries.map((row) => renderCell(row, null, { id: virtualRoomId, room_code: 'VIRTUAL' }, true))}
                  {renderCell(undefined, null, { id: virtualRoomId, room_code: 'VIRTUAL' }, true)}
                </>
              )}
            </div>
          </div>
        )}

        {gridState === 'ready' && (
          <div className="remarks-section" style={{ display: 'block' }}>
            <div className="remarks-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                Faculty Remarks &amp; Extra Activities
              </div>
              <button className="btn btn-primary btn-sm" style={{ height: 32, fontSize: '0.75rem' }} onClick={openRemarkModal}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: '#fff', fill: 'none', strokeWidth: 2, marginRight: 4 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Add Remark
              </button>
            </div>
            <div className="remarks-grid">
              {remarksData.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', background: 'var(--bg-main)', borderRadius: 8 }}>
                  No remarks or extra activities logged for this date.
                </div>
              ) : (
                remarksData.map((r) => (
                  <div className="remark-card" key={r.id}>
                    <button className="btn-delete-remark" title="Delete Remark" onClick={() => deleteRemark(r.id)}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <div className="rm-fac">{r.faculty?.full_name || 'Unknown Faculty'}</div>
                    <div className="rm-time">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      {r.start_time ? r.start_time.slice(0, 5) : '--:--'} - {r.end_time ? r.end_time.slice(0, 5) : '--:--'}
                    </div>
                    <div className="rm-text">{r.remark}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`modal-back${cellModalOpen ? ' open' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <div>
              <div className="modal-title">
                {!activeCell?.row ? 'Add Lecture' : activeCell.row.is_cancelled ? 'Cancelled Slot' : ({ absent: 'Resolve Absent Slot', warn: 'Double-Booked Slot', resolved: 'Edit Rescheduled Slot', normal: 'Edit Slot' } as Record<string, string>)[activeCell.state] ?? 'Edit Slot'}
              </div>
              <div className="modal-sub">{activeCell?.isVirtual ? 'VIRTUAL LECTURE' : `${activeCell?.time}  ·  Room ${activeCell?.rcode}`}</div>
            </div>
            <button className="modal-xbtn" onClick={closeModal}><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>
          <div className="modal-body">
            {activeCell?.row && (
              <div>
                <div className="msec-title">Current Lecture</div>
                <div className="info-box">{buildInfo(activeCell.row)}</div>
              </div>
            )}

            {!activeCell?.row?.is_cancelled && (
              <div>
                {!activeCell?.row && (
                  <>
                    <div className="msec-title">Choose Subject &amp; Faculty</div>
                    <div style={{ display: 'block', marginBottom: '.75rem' }}>
                      <label className="field" style={{ marginBottom: '.4rem' }}><span style={{ fontSize: '.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-label)' }}>Select Course</span></label>
                      <select value={pickedCourseId} onChange={(e) => handleCoursePickChange(e.target.value)}>
                        <option value="">— select course —</option>
                        {courses.map((c) => <option key={c.id} value={c.id}>{courseName(c)}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {activeCell?.row && <div className="msec-title">Replace with</div>}

                <div className="option-list">
                  {csfLoading ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '.83rem', textAlign: 'center', padding: '1rem' }}><span className="spin" /></div>
                  ) : csfOptions.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '.83rem', padding: '.5rem' }}>
                      {!activeCell?.row && !pickedCourseId ? 'Select a course above to see options.' : 'No CSF mappings for this course.'}
                    </div>
                  ) : (
                    csfOptions.map((o) => (
                      <div key={o.csfId} className={`opt-item${selectedOpt?.csfId === o.csfId ? ' selected' : ''}`} onClick={() => setSelectedOpt(o)}>
                        <div className="opt-radio"><div className="opt-dot" /></div>
                        <div className="opt-text"><div className="opt-subject">{o.subjectName}</div><div className="opt-faculty">Prof. {o.facultyName}</div></div>
                        <div className="opt-warns">
                          {o.warnAbsent && <span className="warn-tag absent-tag">⚠ ABSENT</span>}
                          {o.warnBusy && <span className="warn-tag">⚠ BUSY</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeCell?.isVirtual && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div className="msec-title">Virtual Lecture Time</div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Start Time (Optional)</label>
                    <input type="time" style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', fontFamily: 'inherit' }} value={virtualStart} onChange={(e) => setVirtualStart(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>End Time (Optional)</label>
                    <input type="time" style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', fontFamily: 'inherit' }} value={virtualEnd} onChange={(e) => setVirtualEnd(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {activeCell?.row && !activeCell.row.is_cancelled && (
              <div className="cancel-area">
                <div className="msec-title">Or cancel this slot</div>
                <input type="text" placeholder="Reason for cancellation (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
            )}
          </div>
          <div className="modal-footer">
            <div>
              {activeCell?.row?.is_cancelled && (
                <button className="btn btn-success btn-sm" onClick={handleUncancelSlot}>↩ Restore Lecture</button>
              )}
              {activeCell?.row && !activeCell.row.is_cancelled && (
                <>
                  <button className="btn btn-danger btn-sm" onClick={handleCancelSlot}>✕ Cancel Slot</button>{' '}
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', borderColor: 'rgba(224,92,107,.3)' }} onClick={deleteLecture}>🗑 Delete Lecture</button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '.65rem', marginLeft: 'auto' }}>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Close</button>
              {!activeCell?.row?.is_cancelled && (
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>
                  <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, stroke: '#fff', fill: 'none', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}><polyline points="20,6 9,17 4,12" /></svg>
                  Confirm
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`modal-back${remarkOpen ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 450 }}>
          <div className="modal-header">
            <div className="modal-title">Add Faculty Remark</div>
            <button className="modal-xbtn" onClick={() => setRemarkOpen(false)}><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Faculty *</label>
              <select value={remarkFaculty} onChange={(e) => setRemarkFaculty(e.target.value)}>
                <option value="">— select faculty —</option>
                {allFaculty.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Start Time *</label>
                <input type="time" style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', fontFamily: 'inherit' }} value={remarkStart} onChange={(e) => setRemarkStart(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>End Time *</label>
                <input type="time" style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', fontFamily: 'inherit' }} value={remarkEnd} onChange={(e) => setRemarkEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remark / Activity Details *</label>
              <textarea rows={3} placeholder="e.g. Exam Duty, Meeting, Guest Lecture..." style={{ width: '100%', padding: '0.6rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', fontFamily: 'inherit', resize: 'vertical' }} value={remarkText} onChange={(e) => setRemarkText(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost btn-sm" onClick={() => setRemarkOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={remarkSaving} onClick={saveRemark}>Save Remark</button>
          </div>
        </div>
      </div>

      <div className={`modal-back${generateTypeOpen ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <div className="modal-title">Create Schedule</div>
            <button className="modal-xbtn" onClick={() => setGenerateTypeOpen(false)}><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              How would you like to set up the schedule for <strong>{new Date(selectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={generating} onClick={() => { setGenerateTypeOpen(false); generateOrLoad(false, 'master'); }}>
                <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, marginRight: 8, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Import from Master Timetable
              </button>
              <button className="btn btn-ghost" style={{ justifyContent: 'center', border: '1px solid var(--border)' }} disabled={generating} onClick={() => { setGenerateTypeOpen(false); generateOrLoad(false, 'blank'); }}>
                <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, marginRight: 8, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                Start with Blank Schedule
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`modal-back${regenOpen ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <div className="modal-title">Delete &amp; Regenerate?</div>
            <button className="modal-xbtn" onClick={() => setRegenOpen(false)}><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
              This will <strong style={{ color: 'var(--error)' }}>permanently delete</strong> today&apos;s entire schedule including all edits. Cannot be undone.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button className="btn btn-danger" style={{ justifyContent: 'center' }} onClick={async () => { setRegenOpen(false); await generateOrLoad(true, 'master'); }}>Delete &amp; Import from Master</button>
              <button className="btn btn-ghost" style={{ justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--error)' }} onClick={async () => { setRegenOpen(false); await generateOrLoad(true, 'blank'); }}>Delete &amp; Clear to Blank</button>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
