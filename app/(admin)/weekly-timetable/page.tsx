'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import TomSelectField from '@/components/TomSelectField';
import './weekly.css';

interface TimeSlot {
  id: string;
  slot_label: string | null;
  start_time: string;
  end_time: string;
  slot_type: 'lecture' | 'recess' | 'lunch';
  sort_order: number;
  day_type: 'weekday' | 'saturday';
}
interface MasterRow {
  id: string;
  day_type: string;
  time_slot_id: string | null;
  room_id: string;
  course_id: string;
  subject_id: string;
  faculty_id: string;
  virtual_start_time: string | null;
  virtual_end_time: string | null;
  course: { id: string; year: string; program: string; division: string | null } | null;
  subject: { id: string; subject_name: string } | null;
  faculty: { id: string; full_name: string } | null;
  room: { id: string; room_code: string } | null;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function courseName(c: MasterRow['course']) {
  if (!c) return '';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}

function formatCellText(row: MasterRow | null | undefined, filterType: string) {
  if (!row) return null;
  let line1 = '';
  const line2 = row.subject?.subject_name || '—';
  let line3 = '';
  if (filterType === 'room') {
    line1 = courseName(row.course);
    line3 = row.faculty?.full_name || '';
  } else if (filterType === 'faculty') {
    line1 = courseName(row.course);
    line3 = row.room?.room_code || '';
  } else if (filterType === 'course') {
    line1 = row.room?.room_code || '';
    line3 = row.faculty?.full_name || '';
  }
  return { line1, line2, line3 };
}

function virtualCol1(filter: string) {
  return filter === 'course' ? 'Room' : 'Course';
}
function virtualCol2(filter: string) {
  return filter === 'faculty' ? 'Room' : 'Faculty';
}

export default function WeeklyTimetablePage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<{ value: string; label: string }[]>([]);
  const [faculties, setFaculties] = useState<{ value: string; label: string }[]>([]);
  const [rooms, setRooms] = useState<{ value: string; label: string }[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [masterData, setMasterData] = useState<MasterRow[]>([]);
  const [generatedBy, setGeneratedBy] = useState('Admin');

  const [filterType, setFilterType] = useState<'course' | 'faculty' | 'room'>('course');
  const [entityId, setEntityId] = useState('');
  const [viewData, setViewData] = useState<{ matrix: Record<string, Record<string, MasterRow | null>>; filterType: string; entityId: string; entityName: string } | null>(null);
  const [virtualLoad, setVirtualLoad] = useState<MasterRow[]>([]);

  const entityOptionsRef = useRef<{ value: string; label: string }[]>([]);

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
    (async () => {
      setLoading(true);
      try {
        const [crsRes, facRes, rmRes, tsRes, masterRes] = await Promise.all([
          supabase.from('courses').select('id, year, program, division').eq('is_active', true),
          supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name'),
          supabase.from('rooms').select('id, room_code').eq('is_active', true).order('room_code'),
          supabase.from('time_slots').select('*').order('sort_order'),
          supabase
            .from('master_timetable')
            .select(
              `id, day_type, time_slot_id, room_id, course_id, subject_id, faculty_id, virtual_start_time, virtual_end_time,
               course:courses(id, year, program, division),
               subject:subjects(id, subject_name),
               faculty:faculty(id, full_name),
               room:rooms(id, room_code)`
            )
            .eq('is_active', true),
        ]);

        const cOpts = (crsRes.data || []).map((c) => ({ value: c.id, label: courseName(c as MasterRow['course']) })).sort((a, b) => a.label.localeCompare(b.label));
        const fOpts = (facRes.data || []).map((f) => ({ value: f.id, label: f.full_name }));
        const rOpts = (rmRes.data || []).filter((r) => r.room_code !== 'VIRTUAL').map((r) => ({ value: r.id, label: r.room_code }));

        setCourses(cOpts);
        setFaculties(fOpts);
        setRooms(rOpts);
        entityOptionsRef.current = cOpts;
        setTimeSlots(tsRes.data || []);
        setMasterData((masterRes.data as unknown as MasterRow[]) || []);
      } catch (e) {
        toast('Failed to load data: ' + (e as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterTypeChange(val: string) {
    const ft = val as 'course' | 'faculty' | 'room';
    setFilterType(ft);
    setEntityId('');
  }

  const entityOptions = filterType === 'course' ? courses : filterType === 'faculty' ? faculties : rooms;
  const entityLabel = filterType === 'course' ? 'Select Course' : filterType === 'faculty' ? 'Select Faculty' : 'Select Room';

  function handleView() {
    if (!entityId) {
      toast(`Please select a ${filterType} first.`, 'warn');
      return;
    }

    const filteredMaster = masterData.filter((row) => {
      if (filterType === 'course') return row.course_id === entityId;
      if (filterType === 'faculty') return row.faculty_id === entityId;
      if (filterType === 'room') return row.room_id === entityId;
      return false;
    });

    const matrix: Record<string, Record<string, MasterRow | null>> = {};
    const virtual: MasterRow[] = [];

    timeSlots.forEach((slot) => {
      matrix[slot.id] = {};
      DAYS.forEach((d) => (matrix[slot.id][d] = null));
    });

    filteredMaster.forEach((row) => {
      if (!row.time_slot_id) {
        virtual.push(row);
      } else if (matrix[row.time_slot_id]) {
        matrix[row.time_slot_id][row.day_type] = row;
      }
    });

    const entityName = entityOptions.find((o) => o.value === entityId)?.label || '';
    setViewData({ matrix, filterType, entityId, entityName });
    setVirtualLoad(virtual);
  }

  const weekdaySlots = timeSlots.filter((s) => s.day_type === 'weekday').sort((a, b) => a.sort_order - b.sort_order);

  function resolveCell(slotId: string, day: string) {
    let row = viewData?.matrix[slotId]?.[day];
    if (!row && day === 'saturday') {
      const slot = weekdaySlots.find((s) => s.id === slotId);
      const satSlot = timeSlots.find((s) => s.day_type === 'saturday' && s.start_time === slot?.start_time);
      if (satSlot && viewData?.matrix[satSlot.id]) row = viewData.matrix[satSlot.id]['saturday'];
    }
    return row;
  }

  async function handleExportExcel() {
    if (!viewData) return;
    const XLSX = await import('xlsx');
    const { entityName } = viewData;
    let titleStr = `Weekly Timetable — ${entityName}`;
    if (filterType === 'room') titleStr = `Weekly Timetable — Room ${entityName}`;

    const wsData: (string | number)[][] = [[titleStr], []];
    wsData.push(['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    let rowIndex = 2;

    weekdaySlots.forEach((slot) => {
      const timeLabel = `${slot.slot_label || ''}\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;
      if (slot.slot_type !== 'lecture') {
        const lbl = slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess';
        const row = [timeLabel, lbl];
        for (let i = 1; i < 6; i++) row.push('');
        wsData.push(row);
        merges.push({ s: { r: rowIndex, c: 1 }, e: { r: rowIndex, c: 6 } });
        rowIndex += 1;
      } else {
        const row1 = [timeLabel];
        const row2 = [''];
        const row3 = [''];
        DAYS.forEach((day) => {
          const rData = resolveCell(slot.id, day);
          const text = formatCellText(rData, filterType);
          if (text) {
            row1.push(text.line1);
            row2.push(text.line2);
            row3.push(text.line3);
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

    if (virtualLoad.length > 0) {
      const c1 = virtualCol1(filterType);
      const c2 = virtualCol2(filterType);
      wsData.push([], ['Virtual / Flexible Load']);
      wsData.push(['Day', 'Time', c1, 'Subject', c2]);
      virtualLoad.forEach((row) => {
        const text = formatCellText(row, filterType);
        const dayCap = row.day_type.charAt(0).toUpperCase() + row.day_type.slice(1);
        const time = row.virtual_start_time && row.virtual_end_time ? `${row.virtual_start_time.slice(0, 5)} - ${row.virtual_end_time.slice(0, 5)}` : 'Flexible';
        wsData.push([dayCap, time, text?.line1 || '', text?.line2 || '', text?.line3 || '']);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly TT');
    XLSX.writeFile(wb, `Weekly_Timetable_${entityName.replace(/\s+/g, '_')}.xlsx`);
  }

  async function handleExportPdf() {
    if (!viewData) return;
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const { entityName } = viewData;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a1' });
    const pageW = doc.internal.pageSize.width;

    const head = [['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[] = [];
    let dataRowIndex = 0;

    weekdaySlots.forEach((slot) => {
      const timeLabel = `${slot.slot_label || ''}\n\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;
      if (slot.slot_type !== 'lecture') {
        const lbl = slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess';
        body.push([
          { content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } },
          { content: lbl, colSpan: 6, styles: { halign: 'center', valign: 'middle', fontStyle: 'italic', textColor: [100, 100, 100] } },
        ]);
      } else {
        const rowData: unknown[] = [{ content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } }];
        DAYS.forEach((day) => {
          const rData = resolveCell(slot.id, day);
          const text = formatCellText(rData, filterType);
          if (text) {
            rowData.push({ content: `${text.line1}\n${text.line2}\n${text.line3}`, styles: { halign: 'center', valign: 'middle' } });
          } else {
            rowData.push({ content: '', styles: { halign: 'center', valign: 'middle' } });
          }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rowData as any)._dataRowIndex = dataRowIndex++;
        body.push(rowData);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head,
      body,
      startY: 300,
      theme: 'grid',
      styles: { fontSize: 16, cellPadding: 16, valign: 'middle', halign: 'center', overflow: 'linebreak', lineColor: [0, 0, 0], lineWidth: 1.5, textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 20, halign: 'center' },
      columnStyles: { 0: { cellWidth: 160 } },
      margin: { left: 80, right: 80, bottom: 80 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: function (data: any) {
        if (data.section === 'body' && data.column.index > 0 && data.row.raw._dataRowIndex !== undefined) {
          const idx = data.row.raw._dataRowIndex;
          if (idx < 3) data.cell.styles.fillColor = [252, 235, 240];
          else if (idx < 5) data.cell.styles.fillColor = [235, 245, 255];
          else data.cell.styles.fillColor = [255, 243, 230];
        }
        if (data.section === 'body' && data.row.raw._dataRowIndex === undefined && data.column.index > 0) {
          data.cell.styles.fillColor = [245, 245, 245];
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawPage() {
        const cx = pageW / 2;
        doc.setFont('times', 'bold');
        doc.setFontSize(48);
        doc.setTextColor(0, 0, 0);
        doc.text('B. K. Birla College, Kalyan', cx, 110, { align: 'center' });
        doc.setFont('times', 'normal');
        doc.setFontSize(28);
        doc.text('(Empowered Autonomous Status)', cx, 150, { align: 'center' });
        doc.setFont('times', 'bolditalic');
        doc.setFontSize(32);
        doc.text('Department of Management Studies', cx, 190, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(30);
        let titleStr = `Weekly Timetable — ${entityName}`;
        if (filterType === 'room') titleStr = `Weekly Timetable — Room ${entityName}`;
        doc.text(titleStr, cx, 260, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(18);
        doc.setTextColor(100);
        doc.text(`Generated By: ${generatedBy}`, 80, doc.internal.pageSize.height - 60);
        doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 80, doc.internal.pageSize.height - 40);
      },
    });

    if (virtualLoad.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentY = (doc as any).lastAutoTable.finalY + 50;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(0, 0, 0);
      doc.text('Virtual / Flexible Load', 80, currentY);

      const c1 = virtualCol1(filterType);
      const c2 = virtualCol2(filterType);
      const vBody = virtualLoad.map((row) => {
        const text = formatCellText(row, filterType);
        const dayCap = row.day_type.charAt(0).toUpperCase() + row.day_type.slice(1);
        const time = row.virtual_start_time && row.virtual_end_time ? `${row.virtual_start_time.slice(0, 5)} - ${row.virtual_end_time.slice(0, 5)}` : 'Flexible';
        return [dayCap, time, text?.line1 || '', text?.line2 || '', text?.line3 || ''];
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Day', 'Time', c1, 'Subject', c2]],
        body: vBody,
        startY: currentY + 30,
        theme: 'grid',
        styles: { fontSize: 18, cellPadding: 16, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 1.5 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 20 },
        margin: { left: 80, right: 80 },
      });
    }

    doc.save(`Weekly_Timetable_${entityName.replace(/\s+/g, '_')}.pdf`);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Weekly Timetable View</h1>
          <p className="page-subtitle">View, print, and export a full week&apos;s schedule for any Course, Faculty, or Room</p>
        </div>
      </div>

      <div className="content">
        <div className="controls-bar">
          <div className="controls-group" style={{ flex: 1, maxWidth: 600 }}>
            <div className="field" style={{ width: 150 }}>
              <label>Filter By</label>
              <select value={filterType} onChange={(e) => handleFilterTypeChange(e.target.value)}>
                <option value="course">Course</option>
                <option value="faculty">Faculty</option>
                <option value="room">Room</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 250 }}>
              <label>{entityLabel}</label>
              {!loading && (
                <TomSelectField key={filterType} options={entityOptions} value={entityId} onChange={setEntityId} placeholder="Select..." allowEmptyOption />
              )}
            </div>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={handleView}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: '#fff', fill: 'none', strokeWidth: 2, marginRight: 6 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              View
            </button>
          </div>

          <div className="controls-group" style={{ gap: '0.75rem' }}>
            <button className="btn-export" disabled={!viewData} onClick={handleExportExcel}>Excel</button>
            <button className="btn-export" disabled={!viewData} onClick={handleExportPdf}>PDF</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {!viewData ? (
            <div className="weekly-grid-wrap">
              <div className="grid-placeholder">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <div>Select a filter and click <strong>View</strong> to generate the weekly timetable.</div>
              </div>
            </div>
          ) : (
            <div className="weekly-grid-wrap">
              <div className="wg-header">
                <div className="wg-th">Time</div>
                {DAYS.map((d) => <div className="wg-th" key={d}>{d}</div>)}
              </div>
              {weekdaySlots.map((slot) => (
                <div key={slot.id} className={`wg-row${slot.slot_type !== 'lecture' ? ' is-break' : ''}`}>
                  <div className="wg-time">
                    <span className="tl">{slot.slot_label || ''}</span>
                    <span className="tr">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</span>
                  </div>
                  {slot.slot_type !== 'lecture' ? (
                    <div className="break-label">{slot.slot_type === 'lunch' ? '🍽 LUNCH BREAK' : '☕ RECESS'}</div>
                  ) : (
                    DAYS.map((day) => {
                      const rowData = resolveCell(slot.id, day);
                      const text = formatCellText(rowData, filterType);
                      return (
                        <div key={day} className={`wg-cell${text ? ' filled' : ''}`}>
                          {text && (
                            <>
                              <div className="wg-line1">{text.line1}</div>
                              <div className="wg-line2">{text.line2}</div>
                              <div className="wg-line3">{text.line3}</div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {viewData && virtualLoad.length > 0 && (
          <div className="virtual-section" style={{ display: 'block' }}>
            <div className="virtual-header">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Virtual / Flexible Load
            </div>
            <div className="v-grid">
              {virtualLoad.map((row) => {
                const text = formatCellText(row, filterType);
                const dayCap = row.day_type.charAt(0).toUpperCase() + row.day_type.slice(1);
                const time = row.virtual_start_time && row.virtual_end_time ? `${row.virtual_start_time.slice(0, 5)} - ${row.virtual_end_time.slice(0, 5)}` : 'Flexible';
                return (
                  <div className="v-card" key={row.id}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                      {dayCap} &bull; {time}
                    </div>
                    <div className="wg-line1">{text?.line1}</div>
                    <div className="wg-line2" style={{ fontSize: '0.9rem' }}>{text?.line2}</div>
                    <div className="wg-line3">{text?.line3}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
