import { createClient } from '@/lib/supabase/client';

export interface TimeSlot {
  id: string;
  slot_label: string;
  start_time: string;
  end_time: string;
  slot_type: 'lecture' | 'recess' | 'lunch';
  sort_order: number;
}
export interface RoomRef {
  id: string;
  room_code: string;
}
export interface CourseRef {
  id: string;
  course_code: string;
  year: string;
  program: string;
  division: string | null;
  label?: string;
}
export interface SubjectRef {
  id: string;
  subject_name: string;
}
export interface FacultyRef {
  id: string;
  full_name: string;
}
export interface MasterEntry {
  id: string;
  day_type: string;
  is_active: boolean;
  time_slot_id: string | null;
  room_id: string;
  virtual_start_time: string | null;
  virtual_end_time: string | null;
  time_slot: TimeSlot | null;
  room: RoomRef | null;
  course: CourseRef | null;
  subject: SubjectRef | null;
  faculty: FacultyRef | null;
  csf_id: string;
  course_id: string;
  subject_id: string;
  faculty_id: string;
}
export type MasterMap = Record<string, Record<string, MasterEntry>>;

export function courseLabel(c: CourseRef | null | undefined) {
  if (!c) return '—';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}

export async function getTimeSlots(dayType: 'weekday' | 'saturday'): Promise<TimeSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('time_slots')
    .select('id, slot_label, start_time, end_time, slot_type, sort_order')
    .eq('day_type', dayType)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function getActiveRooms(): Promise<RoomRef[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('rooms').select('id, room_code').eq('is_active', true).order('room_code');
  if (error) throw error;
  return data ?? [];
}

export async function getMasterTimetable(dayType: string): Promise<MasterMap> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('master_timetable')
    .select(
      `id, day_type, is_active, time_slot_id, room_id, virtual_start_time, virtual_end_time,
       time_slot:time_slots(id, slot_label, start_time, end_time, slot_type, sort_order),
       room:rooms(id, room_code),
       course:courses(id, course_code, year, program, division),
       subject:subjects(id, subject_name),
       faculty:faculty(id, full_name),
       csf_id, course_id, subject_id, faculty_id`
    )
    .eq('day_type', dayType)
    .eq('is_active', true);
  if (error) throw error;

  const map: MasterMap = {};
  for (const row of (data as unknown as MasterEntry[]) ?? []) {
    const rId = row.room_id;
    if (!rId) continue;
    if (!row.time_slot_id) {
      if (!map['null']) map['null'] = {};
      map['null'][row.id] = row;
    } else {
      const tsId = row.time_slot_id;
      if (!map[tsId]) map[tsId] = {};
      map[tsId][rId] = row;
    }
  }
  return map;
}

export async function upsertMasterEntry(params: {
  entryId: string | null;
  dayType: string;
  timeSlotId: string | null;
  roomId: string;
  csfId: string;
  courseId: string;
  subjectId: string;
  facultyId: string;
  virtual_start_time: string | null;
  virtual_end_time: string | null;
}) {
  const supabase = createClient();
  const payload = {
    day_type: params.dayType,
    time_slot_id: params.timeSlotId || null,
    room_id: params.roomId,
    csf_id: params.csfId,
    course_id: params.courseId,
    subject_id: params.subjectId,
    faculty_id: params.facultyId,
    virtual_start_time: params.virtual_start_time || null,
    virtual_end_time: params.virtual_end_time || null,
    is_active: true,
  };

  let result;
  if (params.entryId) {
    result = await supabase.from('master_timetable').update(payload).eq('id', params.entryId).select().single();
  } else if (params.timeSlotId) {
    result = await supabase.from('master_timetable').upsert(payload, { onConflict: 'day_type,time_slot_id,room_id' }).select().single();
  } else {
    result = await supabase.from('master_timetable').insert([payload]).select().single();
  }
  if (result.error) throw result.error;
  return result.data;
}

export async function clearMasterEntry(entryId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('master_timetable').update({ is_active: false }).eq('id', entryId);
  if (error) throw error;
}

export interface CSFOption {
  csfId: string;
  subjectId: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  label: string;
}

export async function getCSFForCourse(courseId: string): Promise<CSFOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('course_subject_faculty')
    .select(
      `id, subject_id, faculty_id,
       subject:subjects!subject_id(id, subject_name),
       faculty:faculty!faculty_id(id, full_name)`
    )
    .eq('course_id', courseId)
    .eq('is_active', true);
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []).map((row) => ({
    csfId: row.id,
    subjectId: row.subject_id,
    subjectName: row.subject.subject_name,
    facultyId: row.faculty_id,
    facultyName: row.faculty.full_name,
    label: `${row.subject.subject_name} — Prof. ${row.faculty.full_name}`,
  }));
}

export async function getAllActiveCourses(): Promise<CourseRef[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('courses')
    .select('id, course_code, year, program, division')
    .eq('is_active', true)
    .order('year')
    .order('program')
    .order('division');
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, label: courseLabel(c) }));
}
