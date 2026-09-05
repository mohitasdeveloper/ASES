'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, exportToPDF, preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import '../list-page.css';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string | null;
  is_active: boolean;
}

type SortKey = 'subject_code' | 'subject_name';

export default function SubjectsPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [rows, setRows] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('subject_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
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

  async function loadData() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, subject_name, subject_code, is_active')
        .order('subject_name');
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      toast((e as Error).message, 'error');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const fSearch = search.toLowerCase();
    const out = rows.filter((r) => {
      if (!fSearch) return true;
      const textStr = `${r.subject_code || ''} ${r.subject_name || ''}`.toLowerCase();
      return textStr.includes(fSearch);
    });
    out.sort((a, b) => {
      const cmp = (a[sortKey] || '').toString().localeCompare((b[sortKey] || '').toString(), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    setSortDir((d) => (sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }

  function openModal(row: Subject | null) {
    setCurrentId(row?.id ?? null);
    setSubjectCode(row?.subject_code ?? '');
    setSubjectName(row?.subject_name ?? '');
    setIsActive(row?.is_active ?? true);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setCurrentId(null);
  }

  async function handleSave() {
    const name = subjectName.trim();
    const code = subjectCode.trim();
    if (!name || !code) {
      toast('Subject Code and Subject Name are required', 'warn');
      return;
    }
    setSaving(true);
    try {
      const payload = { subject_code: code, subject_name: name, is_active: isActive };
      if (currentId) {
        const { error } = await supabase.from('subjects').update(payload).eq('id', currentId);
        if (error) throw error;
        toast('Subject updated successfully');
      } else {
        const { error } = await supabase.from('subjects').insert(payload);
        if (error) throw error;
        toast('Subject created successfully');
      }
      closeModal();
      await loadData();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleExportPdf() {
    if (!filtered.length) return toast('No data to export', 'warn');
    const flat = filtered.map((r) => ({ code: r.subject_code || '—', name: r.subject_name || '—', status: r.is_active ? 'Active' : 'Inactive' }));
    exportToPDF(
      flat,
      [
        { header: 'Subject Code', key: 'code', width: 30 },
        { header: 'Subject Name', key: 'name', width: 60 },
        { header: 'Status', key: 'status', width: 20 },
      ],
      'Subject List',
      'Subjects_Report',
      '',
      generatedBy
    );
  }
  function handleExportExcel() {
    if (!filtered.length) return toast('No data to export', 'warn');
    const flat = filtered.map((r) => ({ code: r.subject_code || '—', name: r.subject_name || '—', status: r.is_active ? 'Active' : 'Inactive' }));
    exportToExcel(
      flat,
      [
        { header: 'Subject Code', key: 'code', width: 15 },
        { header: 'Subject Name', key: 'name', width: 45 },
        { header: 'Status', key: 'status', width: 12 },
      ],
      'Subjects_Report'
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="page-subtitle">Manage all subjects offered across programs</p>
        </div>
      </div>

      <div className="content">
        <div className="filter-card">
          <div style={{ flex: 1 }}>
            <input
              type="text"
              className="table-search"
              placeholder="🔍 Search subject name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="export-btns">
            <button className="btn-export" onClick={handleExportExcel}>Excel</button>
            <button className="btn-export" onClick={handleExportPdf}>PDF</button>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={() => openModal(null)}>
              + Add Subject
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('subject_code')}>Subject Code</th>
                <th className="sortable" onClick={() => toggleSort('subject_name')}>Subject Name</th>
                <th>Status</th>
                <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}><span className="spin" /> Loading...</td></tr>
              ) : loadError ? (
                <tr className="empty-row"><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--error)' }}>Error loading data</td></tr>
              ) : filtered.length === 0 ? (
                <tr className="empty-row"><td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No subjects match your search.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.subject_code || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.subject_name || '—'}</td>
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
        <div className="modal" style={{ maxWidth: 450 }}>
          <div className="modal-header">
            <div className="modal-title">{currentId ? 'Edit Subject' : 'Add Subject'}</div>
            <button className="btn-icon" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={closeModal}>✕</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Subject Code *</label>
              <input type="text" className="modal-input" placeholder="e.g. ACC101" value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} />
            </div>
            <div className="field">
              <label>Subject Name *</label>
              <input type="text" className="modal-input" placeholder="e.g. Financial Accounting" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="toggle-track" />
              </label>
              <label style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Active</label>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>Save Subject</button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
