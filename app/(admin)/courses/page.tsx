'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast, ToastContainer } from '@/components/Toast';
import './courses.css';

interface Course {
  id: string;
  course_code: string;
  year: string;
  program: string;
  division: string | null;
  is_active: boolean;
}

const YEARS = ['FY', 'SY', 'TY'];
const DIVISIONS = ['A', 'B', 'C'];

export default function CoursesPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState('');
  const [year, setYear] = useState('');
  const [program, setProgram] = useState('');
  const [division, setDivision] = useState('');
  const [status, setStatus] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadCourses() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, course_code, year, program, division, is_active')
        .order('program')
        .order('year')
        .order('division');
      if (error) throw error;
      setCourses(data || []);
    } catch (e) {
      toast((e as Error).message, 'error');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openModal(course: Course | null) {
    if (course) {
      setEditId(course.id);
      setCourseCode(course.course_code || '');
      setYear(course.year);
      setProgram(course.program);
      setDivision(course.division || '');
      setStatus(course.is_active);
    } else {
      setEditId(null);
      setCourseCode('');
      setYear('');
      setProgram('');
      setDivision('');
      setStatus(true);
    }
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditId(null);
  }

  async function handleSave() {
    const code = courseCode.trim();
    const prog = program.trim();
    const div = division.trim();

    if (!code || !year || !prog) {
      toast('Course Code, Year, and Program are required.', 'warn');
      return;
    }

    setSaving(true);
    const payload = { course_code: code, year, program: prog, division: div || null, is_active: status };

    try {
      if (editId) {
        const { error } = await supabase.from('courses').update(payload).eq('id', editId);
        if (error) throw error;
        toast('Course updated successfully.');
      } else {
        const { error } = await supabase.from('courses').insert([payload]);
        if (error) throw error;
        toast('Course created successfully.');
      }
      closeModal();
      await loadCourses();
    } catch (e) {
      const err = e as { code?: string; message: string };
      if (err.code === '23505') {
        toast('A course with this code or program/division already exists.', 'error');
      } else {
        toast(err.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Courses &amp; Divisions</h1>
          <p className="page-subtitle">Manage all active classes and programs</p>
        </div>
        <div className="topbar-controls">
          <button className="btn btn-primary" onClick={() => openModal(null)}>
            <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', marginRight: '0.4rem' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Course
          </button>
        </div>
      </div>

      <div className="content">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Course Code</th>
                <th>Year</th>
                <th>Program</th>
                <th>Division</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <span className="spin" style={{ display: 'inline-block', width: 20, height: 20, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--error)', padding: '2rem' }}>Failed to load courses.</td>
                </tr>
              ) : courses.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      <br />No courses found. Add your first course to get started.
                    </div>
                  </td>
                </tr>
              ) : (
                courses.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.course_code || '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.year}</td>
                    <td>{c.program}</td>
                    <td>{c.division || '—'}</td>
                    <td><span className={`badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-icon edit" title="Edit Course" onClick={() => openModal(c)}>
                          <svg viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`modal-back${modalOpen ? ' open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <div className="modal-header">
            <div className="modal-title">{editId ? 'Edit Course' : 'Add Course'}</div>
            <button className="modal-close" onClick={closeModal}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Course Code *</label>
              <input type="text" placeholder="e.g., SYBMS-A" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Year *</label>
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">— Select —</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Division</label>
                <select value={division} onChange={(e) => setDivision(e.target.value)}>
                  <option value="">— None —</option>
                  {DIVISIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Program Name *</label>
              <input type="text" placeholder="e.g., BMS, BAF, BBI" value={program} onChange={(e) => setProgram(e.target.value)} />
            </div>
            <div className="status-toggle-wrapper">
              <label className="toggle-switch">
                <input type="checkbox" checked={status} onChange={(e) => setStatus(e.target.checked)} />
                <span className="toggle-track" />
              </label>
              <span className="status-toggle-label">Active Status</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-modal-cancel" onClick={closeModal}>Cancel</button>
            <button className="btn-modal-save" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving...' : 'Save Course'}
            </button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
