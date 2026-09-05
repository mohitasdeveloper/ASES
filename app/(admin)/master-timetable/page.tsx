'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TomSelectLib from 'tom-select';
import 'tom-select/dist/css/tom-select.css';
import { createClient } from '@/lib/supabase/client';
import { preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import {
  getTimeSlots,
  getActiveRooms,
  getMasterTimetable,
  upsertMasterEntry,
  clearMasterEntry,
  getCSFForCourse,
  getAllActiveCourses,
  courseLabel,
  type TimeSlot,
  type RoomRef,
  type CourseRef,
  type MasterMap,
  type MasterEntry,
  type CSFOption,
} from '@/lib/masterTimetable';
import './timetable.css';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function slotDayType(day: string): 'weekday' | 'saturday' {
  return day === 'saturday' ? 'saturday' : 'weekday';
}

export default function MasterTimetablePage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [currentDay, setCurrentDay] = useState('monday');
  const [courses, setCourses] = useState<CourseRef[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<RoomRef[]>([]);
  const [ttMap, setTtMap] = useState<MasterMap>({});
  const [virtualRoomId, setVirtualRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedBy, setGeneratedBy] = useState('Admin');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTimeSlotId, setModalTimeSlotId] = useState<string | null>(null);
  const [modalRoomId, setModalRoomId] = useState<string | null>(null);
  const [existingEntry, setExistingEntry] = useState<MasterEntry | null>(null);
  const [isVirtual, setIsVirtual] = useState(false);
  const [csfOptions, setCsfOptions] = useState<CSFOption[]>([]);
  const [csfLoading, setCsfLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedCsf, setSelectedCsf] = useState('');
  const [virtualStart, setVirtualStart] = useState('');
  const [virtualEnd, setVirtualEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const courseSelectRef = useRef<HTMLSelectElement>(null);
  const csfSelectRef = useRef<HTMLSelectElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tsCourseRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tsCsfRef = useRef<any>(null);

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

  async function loadGrid() {
    setLoading(true);
    try {
      const allRooms = await getActiveRooms();
      let vRoomId: string | null = null;
      const physicalRooms = allRooms.filter((r) => {
        if (r.room_code === 'VIRTUAL') {
          vRoomId = r.id;
          return false;
        }
        return true;
      });
      setVirtualRoomId(vRoomId);
      setRooms(physicalRooms);

      const [c, ts, map] = await Promise.all([getAllActiveCourses(), getTimeSlots(slotDayType(currentDay)), getMasterTimetable(currentDay)]);
      setCourses(c);
      setTimeSlots(ts);
      setTtMap(map);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDay]);

  const virtualEntries = useMemo(() => (ttMap['null'] ? Object.values(ttMap['null']) : []), [ttMap]);

  function openModal(timeSlotId: string | null, roomId: string, entryId: string | undefined, virtual: boolean) {
    setModalTimeSlotId(virtual ? null : timeSlotId);
    setModalRoomId(roomId);
    setIsVirtual(virtual);
    setCsfOptions([]);
    setSelectedCsf('');
    setVirtualStart('');
    setVirtualEnd('');

    let entry: MasterEntry | null = null;
    if (entryId) {
      entry = virtual ? ttMap['null']?.[entryId] : ttMap[timeSlotId as string]?.[roomId];
    }
    setExistingEntry(entry || null);
    setSelectedCourse(entry?.course_id || '');
    if (entry && virtual) {
      setVirtualStart(entry.virtual_start_time || '');
      setVirtualEnd(entry.virtual_end_time || '');
    }
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setExistingEntry(null);
    setModalTimeSlotId(null);
    setModalRoomId(null);
  }

  // Init Tom Select for course dropdown whenever modal opens
  useEffect(() => {
    if (!modalOpen || !courseSelectRef.current) return;

    const ts = new TomSelectLib(courseSelectRef.current, {
      placeholder: 'Search course…',
      onChange: async (val: string) => {
        setSelectedCourse(val);
        setCsfOptions([]);
        setSelectedCsf('');
        if (!val) return;
        setCsfLoading(true);
        try {
          const opts = await getCSFForCourse(val);
          setCsfOptions(opts);
        } catch (e) {
          toast((e as Error).message, 'error');
        } finally {
          setCsfLoading(false);
        }
      },
    });
    tsCourseRef.current = ts;
    if (existingEntry?.course_id) {
      ts.setValue(existingEntry.course_id, true);
    }

    return () => {
      ts.destroy();
      tsCourseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  // Init Tom Select for CSF dropdown whenever options change
  useEffect(() => {
    if (!modalOpen || !csfSelectRef.current || csfOptions.length === 0) return;

    const ts = new TomSelectLib(csfSelectRef.current, {
      placeholder: 'Search subject / faculty…',
      onChange: (val: string) => setSelectedCsf(val),
    });
    tsCsfRef.current = ts;

    return () => {
      ts.destroy();
      tsCsfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, csfOptions]);

  async function handleSave() {
    if (!selectedCourse || !selectedCsf) return;
    const opt = csfOptions.find((o) => o.csfId === selectedCsf);
    if (!opt) return;

    setSaving(true);
    try {
      await upsertMasterEntry({
        entryId: existingEntry?.id || null,
        dayType: currentDay,
        timeSlotId: modalTimeSlotId,
        roomId: modalRoomId!,
        csfId: selectedCsf,
        courseId: selectedCourse,
        subjectId: opt.subjectId,
        facultyId: opt.facultyId,
        virtual_start_time: isVirtual ? virtualStart || null : null,
        virtual_end_time: isVirtual ? virtualEnd || null : null,
      });
      toast('Timetable assigned successfully.');
      closeModal();
      await loadGrid();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!existingEntry?.id) return;
    try {
      await clearMasterEntry(existingEntry.id);
      toast('Lecture removed.', 'warn');
      closeModal();
      await loadGrid();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function handleExportExcel() {
    if (!timeSlots.length || !rooms.length) return toast('No timetable data to export', 'error');
    const XLSX = await import('xlsx');
    const dayCap = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);
    const wsData: (string | number)[][] = [];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

    const headRow = ['Time', ...rooms.map((r) => `Room ${r.room_code}`)];
    wsData.push(headRow);
    let rowIndex = 1;

    timeSlots.forEach((slot) => {
      const timeLabel =
        slot.slot_type === 'lecture'
          ? `${slot.slot_label}\n\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`
          : `${slot.slot_label}\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;

      if (slot.slot_type !== 'lecture') {
        const lbl = slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess';
        const row = [timeLabel, lbl];
        for (let i = 1; i < rooms.length; i++) row.push('');
        wsData.push(row);
        merges.push({ s: { r: rowIndex, c: 1 }, e: { r: rowIndex, c: rooms.length } });
        rowIndex += 1;
      } else {
        const row1 = [timeLabel];
        const row2 = [''];
        const row3 = [''];
        rooms.forEach((room) => {
          const entry = ttMap[slot.id]?.[room.id];
          if (entry) {
            row1.push(courseLabel(entry.course));
            row2.push(entry.subject?.subject_name || '-');
            row3.push(entry.faculty?.full_name || '-');
          } else {
            row1.push('-');
            row2.push('');
            row3.push('');
          }
        });
        wsData.push(row1, row2, row3);
        merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex + 2, c: 0 } });
        rowIndex += 3;
      }
    });

    if (virtualEntries.length > 0) {
      wsData.push([]);
      wsData.push(['Virtual lecture', '', '', '']);
      wsData.push(['Time', 'Course', 'Subject', 'Faculty']);
      virtualEntries.forEach((e) => {
        const vt = e.virtual_start_time && e.virtual_end_time ? `${e.virtual_start_time.slice(0, 5)} - ${e.virtual_end_time.slice(0, 5)}` : 'Flexible';
        wsData.push([vt, courseLabel(e.course), e.subject?.subject_name || '-', e.faculty?.full_name || '-']);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, ...rooms.map(() => ({ wch: 30 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    XLSX.writeFile(wb, `Master_Timetable_${dayCap}.xlsx`);
  }

  async function handleExportPdf() {
    if (!timeSlots.length || !rooms.length) return toast('No timetable data to export', 'error');
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const dayCap = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a0' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    const head = [['Time', ...rooms.map((r) => `Room ${r.room_code}`)]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[] = [];

    timeSlots.forEach((slot) => {
      const timeLabel =
        slot.slot_type === 'lecture'
          ? `${slot.slot_label}\n\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`
          : `${slot.slot_label}\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;

      if (slot.slot_type !== 'lecture') {
        const lbl = slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess';
        body.push([
          { content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center', fillColor: [240, 240, 245] } },
          { content: lbl, colSpan: rooms.length, styles: { halign: 'center', valign: 'middle', fontStyle: 'italic', textColor: [140, 140, 140] } },
        ]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowData: any[] = [{ content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center', fillColor: [240, 240, 245] } }];
        rooms.forEach((room) => {
          const entry = ttMap[slot.id]?.[room.id];
          if (entry) {
            rowData.push({ content: `${courseLabel(entry.course)}\n${entry.subject?.subject_name || ''}\n${entry.faculty?.full_name || ''}`, styles: { halign: 'center', valign: 'middle' } });
          } else {
            rowData.push({ content: '-', styles: { halign: 'center', valign: 'middle', textColor: [200, 200, 200] } });
          }
        });
        body.push(rowData);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head,
      body,
      startY: 330,
      theme: 'grid',
      styles: { fontSize: 14, cellPadding: 16, valign: 'middle', halign: 'center', overflow: 'linebreak', lineColor: [180, 180, 180], lineWidth: 1 },
      headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold', fontSize: 16, halign: 'center' },
      columnStyles: { 0: { cellWidth: 160, fontStyle: 'bold' } },
      margin: { top: 330, left: 80, right: 80, bottom: 80 },
      tableWidth: 'auto',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawPage(data: any) {
        const cx = pageW / 2;
        doc.setFont('times', 'bold');
        doc.setFontSize(46);
        doc.setTextColor(26, 34, 68);
        doc.text('B. K. Birla College, Kalyan', cx, 100, { align: 'center' });
        doc.setFont('times', 'normal');
        doc.setFontSize(26);
        doc.setTextColor(50, 60, 90);
        doc.text('(Empowered Autonomous Status)', cx, 140, { align: 'center' });
        doc.setFont('times', 'bolditalic');
        doc.setFontSize(30);
        doc.text('Department of Management Studies', cx, 185, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(34);
        doc.setTextColor(26, 34, 68);
        doc.text(`Master Timetable — ${dayCap}`, cx, 250, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(16);
        doc.setTextColor(120);
        doc.text(`Report Generated By: ${generatedBy}`, 80, pageH - 40);
        doc.text(`Report Generated On: ${new Date().toLocaleString('en-IN')}`, 80, pageH - 20);
        doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 20, { align: 'center' });
      },
    });

    if (virtualEntries.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable.finalY + 40;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(26, 34, 68);
      doc.text('Virtual lecture', 80, finalY);

      const vBody = virtualEntries.map((e) => {
        const vt = e.virtual_start_time && e.virtual_end_time ? `${e.virtual_start_time.slice(0, 5)} - ${e.virtual_end_time.slice(0, 5)}` : 'Flexible';
        return [vt, courseLabel(e.course), e.subject?.subject_name || '-', e.faculty?.full_name || '-'];
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Time', 'Course', 'Subject', 'Faculty']],
        body: vBody,
        startY: finalY + 20,
        theme: 'grid',
        styles: { fontSize: 16, cellPadding: 12, valign: 'middle', lineColor: [180, 180, 180], lineWidth: 1 },
        headStyles: { fillColor: [240, 240, 245], textColor: [26, 34, 68], fontStyle: 'bold', fontSize: 18, halign: 'left' },
        margin: { left: 80, right: 80, bottom: 80 },
      });
    }

    doc.save(`Master_Timetable_${dayCap}.pdf`);
  }

  const colCount = 1 + rooms.length;
  const gridStyle = { gridTemplateColumns: `88px repeat(${rooms.length}, minmax(110px,1fr))` };

  return (
    <>
      <div className="topbar">
        <div style={{ width: '100%' }}>
          <div>
            <h1 className="page-title">Master Timetable</h1>
            <p className="page-subtitle">Edit the fixed weekly timetable — click any cell to assign or change</p>
          </div>
          <div className="topbar-controls">
            <div className="day-toggle">
              {DAYS.map((d) => (
                <button key={d} className={`day-btn${currentDay === d ? ' active' : ''}`} onClick={() => setCurrentDay(d)}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-export" onClick={handleExportExcel}>Excel</button>
              <button className="btn-export" onClick={handleExportPdf}>PDF</button>
            </div>
          </div>
        </div>
      </div>

      <div className="content" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="grid-placeholder grid-wrap">
            <div><span className="spin" /> Loading physical grid…</div>
          </div>
        ) : (
          <div className="grid-wrap">
            <div className="grid-header" style={gridStyle}>
              <div className="gh-cell">Time</div>
              {rooms.map((r) => (
                <div className="gh-cell" key={r.id}>Room {r.room_code}</div>
              ))}
            </div>
            {timeSlots.map((slot) => (
              <div key={slot.id} className={`slot-row${slot.slot_type !== 'lecture' ? ' is-break' : ''}`} style={gridStyle}>
                <div className="slot-time">
                  <span className="tl">{slot.slot_label}</span>
                  <span className="tr">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span>
                </div>
                {slot.slot_type !== 'lecture' ? (
                  <div className="break-label" style={{ gridColumn: `2/${colCount + 1}` }}>
                    {slot.slot_type === 'lunch' ? '🍽 Lunch Break' : '☕ Recess'}
                  </div>
                ) : (
                  rooms.map((room) => {
                    const entry = ttMap[slot.id]?.[room.id];
                    return entry ? (
                      <div key={room.id} className="cell filled" onClick={() => openModal(slot.id, room.id, entry.id, false)}>
                        <div className="cell-course">{courseLabel(entry.course)}</div>
                        <div className="cell-subject">{entry.subject?.subject_name ?? '—'}</div>
                        <div className="cell-faculty">{entry.faculty?.full_name ?? '—'}</div>
                      </div>
                    ) : (
                      <div key={room.id} className="cell" onClick={() => openModal(slot.id, room.id, undefined, false)}>
                        <div className="cell-add">
                          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Add
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}

        <div className="virtual-section" style={{ minWidth: 700 }}>
          <div className="virtual-header">
            <h3>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Virtual lecture
            </h3>
          </div>
          <div className="virtual-grid">
            {!virtualRoomId ? (
              <div style={{ width: '100%', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Virtual room not configured in database. Contact administrator.
              </div>
            ) : (
              <>
                {virtualEntries.map((entry) => (
                  <div key={entry.id} className="virtual-cell filled" onClick={() => openModal(null, virtualRoomId, entry.id, true)}>
                    {entry.virtual_start_time && entry.virtual_end_time && (
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 3, fontWeight: 600 }}>
                        {entry.virtual_start_time.slice(0, 5)} - {entry.virtual_end_time.slice(0, 5)}
                      </div>
                    )}
                    <div className="cell-course">{courseLabel(entry.course)}</div>
                    <div className="cell-subject">{entry.subject?.subject_name ?? '—'}</div>
                    <div className="cell-faculty">{entry.faculty?.full_name ?? '—'}</div>
                  </div>
                ))}
                <div className="virtual-cell empty" onClick={() => openModal(null, virtualRoomId, undefined, true)}>
                  <div className="cell-add">
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Add more Lecture
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`modal-back${modalOpen ? ' open' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <div className="modal-title">{existingEntry ? 'Edit Lecture' : 'Assign Lecture'}</div>
            <button className="modal-close" onClick={closeModal}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="modal-body">
            <div id="modal-context">
              <span style={{ fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>{currentDay}</span>
              <span style={{ fontWeight: 500 }}>
                {isVirtual
                  ? 'VIRTUAL LECTURE'
                  : `Room ${rooms.find((r) => r.id === modalRoomId)?.room_code ?? ''} | ${timeSlots.find((s) => s.id === modalTimeSlotId)?.start_time?.slice(0, 5) ?? ''}–${timeSlots.find((s) => s.id === modalTimeSlotId)?.end_time?.slice(0, 5) ?? ''}`}
              </span>
            </div>

            <div className="field">
              <label>Course *</label>
              <select ref={courseSelectRef} defaultValue={selectedCourse}>
                <option value="">— select course —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {csfLoading && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                <span className="spin" /> Loading options…
              </div>
            )}

            {!csfLoading && csfOptions.length > 0 && (
              <div className="field">
                <label>Subject &amp; Faculty *</label>
                <select ref={csfSelectRef} defaultValue={selectedCsf}>
                  <option value="">— select subject / faculty —</option>
                  {csfOptions.map((o) => (
                    <option key={o.csfId} value={o.csfId}>{o.label}</option>
                  ))}
                </select>
                <div className="field-hint">Selecting this auto-assigns subject and faculty.</div>
              </div>
            )}

            {isVirtual && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Virtual Start Time (Optional)</label>
                    <input
                      type="time"
                      style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      value={virtualStart}
                      onChange={(e) => setVirtualStart(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Virtual End Time (Optional)</label>
                    <input
                      type="time"
                      style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      value={virtualEnd}
                      onChange={(e) => setVirtualEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <div>
              {existingEntry && (
                <button className="btn btn-danger btn-sm" onClick={handleClear}>
                  <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                  Clear Cell
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!selectedCourse || !selectedCsf || saving} onClick={handleSave}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
