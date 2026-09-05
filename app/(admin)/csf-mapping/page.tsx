'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, exportToPDF, preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import TomSelectField from '@/components/TomSelectField';
import '../list-page.css';

interface CourseRef {
  id: string;
  year: string;
  program: string;
  division: string | null;
}
interface SubjectRef {
  id: string;
  subject_name: string;
  subject_code: string | null;
}
interface FacultyRef {
  id: string;
  full_name: string;
}
interface CsfRow {
  id: string;
  is_active: boolean;
  course_id: string;
  subject_id: string;
  faculty_id: string;
  course: CourseRef | null;
  subject: SubjectRef | null;
  faculty: FacultyRef | null;
}

function cName(c: CourseRef | null | undefined) {
  if (!c) return '—';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}

type SortKey = 'course' | 'code' | 'subject' | 'faculty';

export default function CsfMappingPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [csfData, setCsfData] = useState<CsfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [courses, setCourses] = useState<CourseRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [faculty, setFaculty] = useState<FacultyRef[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  const [filterCourse, setFilterCourse] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('subject');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mCourse, setMCourse] = useState('');
  const [mSubject, setMSubject] = useState('');
  const [mFaculty, setMFaculty] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatedBy, setGeneratedBy] = useState('Admin');

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

  async function loadDropdowns() {
    setDropdownsLoading(true);
    const [cRes, sRes, fRes] = await Promise.all([
      supabase.from('courses').select('id, year, program, division').eq('is_active', true),
      supabase.from('subjects').select('id, subject_name, subject_code').eq('is_active', true).order('subject_name'),
      supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    setCourses(cRes.data || []);
    setSubjects(sRes.data || []);
    setFaculty(fRes.data || []);
    setDropdownsLoading(false);
  }

  async function loadData() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase.from('course_subject_faculty').select(`
        id, is_active, course_id, subject_id, faculty_id,
        course:courses!course_id(id, year, program, division),
        subject:subjects!subject_id(id, subject_name, subject_code),
        faculty:faculty!faculty_id(id, full_name)
      `);
      if (error) throw error;
      const rows = (data as unknown as CsfRow[]) || [];
      rows.sort((a, b) => (a.subject?.subject_name || '').localeCompare(b.subject?.subject_name || ''));
      setCsfData(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDropdowns().then(loadData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const fSearch = search.toLowerCase();
    const rows = csfData.filter((r) => {
      if (filterCourse && r.course_id !== filterCourse) return false;
      if (filterSubject && r.subject_id !== filterSubject) return false;
      if (fSearch) {
        const textStr = `${cName(r.course)} ${r.subject?.subject_code || ''} ${r.subject?.subject_name || ''} ${r.faculty?.full_name || ''}`.toLowerCase();
        if (!textStr.includes(fSearch)) return false;
      }
      return true;
    });

    const keyFn: Record<SortKey, (r: CsfRow) => string> = {
      course: (r) => cName(r.course),
      code: (r) => r.subject?.subject_code || '',
      subject: (r) => r.subject?.subject_name || '',
      faculty: (r) => r.faculty?.full_name || '',
    };
    rows.sort((a, b) => {
      const cmp = keyFn[sortKey](a).localeCompare(keyFn[sortKey](b), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [csfData, filterCourse, filterSubject, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    setSortDir((d) => (sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }

  function openModal(row: CsfRow | null) {
    setCurrentId(row?.id ?? null);
    setMCourse(row?.course_id ?? '');
    setMSubject(row?.subject_id ?? '');
    setMFaculty(row?.faculty_id ?? '');
    setIsActive(row?.is_active ?? true);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setCurrentId(null);
  }

  async function handleSave() {
    if (!mCourse || !mSubject || !mFaculty) {
      toast('Please fill all required fields', 'warn');
      return;
    }
    setSaving(true);
    try {
      const payload = { course_id: mCourse, subject_id: mSubject, faculty_id: mFaculty, is_active: isActive };
      if (currentId) {
        const { error } = await supabase.from('course_subject_faculty').update(payload).eq('id', currentId);
        if (error) throw error;
        toast('Mapping updated');
      } else {
        const { error } = await supabase.from('course_subject_faculty').insert(payload);
        if (error) throw error;
        toast('Mapping created');
      }
      closeModal();
      await loadData();
    } catch (e) {
      const err = e as { code?: string; message: string };
      if (err.code === '23505') toast('This Course-Subject-Faculty mapping already exists.', 'warn');
      else toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleExportPdf() {
    if (!filtered.length) return toast('No data to export', 'warn');
    const flat = filtered.map((r) => ({
      course: cName(r.course),
      code: r.subject?.subject_code || '—',
      subject: r.subject?.subject_name || '—',
      faculty: `Prof. ${r.faculty?.full_name || '—'}`,
      status: r.is_active ? 'Active' : 'Inactive',
    }));
    exportToPDF(
      flat,
      [
        { header: 'Course', key: 'course', width: 25 },
        { header: 'Subject Code', key: 'code', width: 20 },
        { header: 'Subject Name', key: 'subject', width: 40 },
        { header: 'Faculty', key: 'faculty', width: 30 },
        { header: 'Status', key: 'status', width: 15 },
      ],
      'Course-Subject-Faculty Mapping',
      'CSF_Mapping_Report',
      '',
      generatedBy
    );
  }
  function handleExportExcel() {
    if (!filtered.length) return toast('No data to export', 'warn');
    const flat = filtered.map((r) => ({
      course: cName(r.course),
      code: r.subject?.subject_code || '—',
      subject: r.subject?.subject_name || '—',
      faculty: `Prof. ${r.faculty?.full_name || '—'}`,
      status: r.is_active ? 'Active' : 'Inactive',
    }));
    exportToExcel(
      flat,
      [
        { header: 'Course', key: 'course', width: 25 },
        { header: 'Subject Code', key: 'code', width: 15 },
        { header: 'Subject Name', key: 'subject', width: 40 },
        { header: 'Faculty', key: 'faculty', width: 30 },
        { header: 'Status', key: 'status', width: 12 },
      ],
      'CSF_Mapping_Report'
    );
  }

  const courseOptions = courses.map((c) => ({ value: c.id, label: cName(c) }));
  const subjectOptions = subjects.map((s) => ({ value: s.id, label: s.subject_code ? `${s.subject_code} - ${s.subject_name}` : s.subject_name }));
  const facultyOptions = faculty.map((f) => ({ value: f.id, label: `Prof. ${f.full_name}` }));

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">CSF Mapping</h1>
          <p className="page-subtitle">Manage relationships between Courses, Subjects, and Faculties</p>
        </div>
      </div>

      <div className="content">
        <div className="filter-card">
          <div className="field">
            <label>Filter by Course</label>
            {!dropdownsLoading && (
              <TomSelectField options={courseOptions} value={filterCourse} onChange={setFilterCourse} placeholder="All Courses" allowEmptyOption />
            )}
          </div>
          <div className="field">
            <label>Filter by Subject</label>
            {!dropdownsLoading && (
              <TomSelectField options={subjectOptions} value={filterSubject} onChange={setFilterSubject} placeholder="All Subjects" allowEmptyOption />
            )}
          </div>
          <div className="field">
            <label>Search Data</label>
            <input type="text" className="table-search" placeholder="🔍 Search text..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="export-btns">
            <button className="btn-export" onClick={handleExportExcel}>Excel</button>
            <button className="btn-export" onClick={handleExportPdf}>PDF</button>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={() => openModal(null)}>+ Add Mapping</button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('course')}>Course</th>
                <th className="sortable" onClick={() => toggleSort('code')}>Sub Code</th>
                <th className="sortable" onClick={() => toggleSort('subject')}>Subject Name</th>
                <th className="sortable" onClick={() => toggleSort('faculty')}>Faculty</th>
                <th>Status</th>
                <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}><span className="spin" /> Loading...</td></tr>
              ) : loadError ? (
                <tr className="empty-row"><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--error)' }}>Error loading data</td></tr>
              ) : filtered.length === 0 ? (
                <tr className="empty-row"><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No mappings match your filters.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{cName(r.course)}</strong></td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.subject?.subject_code || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.subject?.subject_name || '—'}</td>
                    <td>Prof. {r.faculty?.full_name || '—'}</td>
                    <td><span className={`badge ${r.is_active ? 'badge-active' : 'badge-inactive'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openModal(r)}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`modal-back${modalOpen ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 500 }}>
          <div className="modal-header">
            <div className="modal-title">{currentId ? 'Edit Mapping' : 'Add Mapping'}</div>
            <button className="btn-icon" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={closeModal}>✕</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Course *</label>
              {modalOpen && !dropdownsLoading && (
                <TomSelectField options={courseOptions} value={mCourse} onChange={setMCourse} placeholder="Select Course..." />
              )}
            </div>
            <div className="field">
              <label>Subject *</label>
              {modalOpen && !dropdownsLoading && (
                <TomSelectField options={subjectOptions} value={mSubject} onChange={setMSubject} placeholder="Select Subject..." />
              )}
            </div>
            <div className="field">
              <label>Faculty *</label>
              {modalOpen && !dropdownsLoading && (
                <TomSelectField options={facultyOptions} value={mFaculty} onChange={setMFaculty} placeholder="Select Faculty..." />
              )}
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="toggle-track" />
              </label>
              <label style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Active Mapping</label>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>Save Mapping</button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
