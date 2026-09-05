'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast, ToastContainer } from '@/components/Toast';
import './remarks.css';

interface FacultyRef { id: string; full_name: string }
interface RemarkRow {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  remark: string;
  faculty: { full_name: string } | null;
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function formatTime(t: string | null) {
  return t ? t.slice(0, 5) : '';
}

export default function RemarksPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [activeFaculty, setActiveFaculty] = useState<FacultyRef[]>([]);
  const [allRemarks, setAllRemarks] = useState<RemarkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(todayStr());
  const [facultySearch, setFacultySearch] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [remarkText, setRemarkText] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'name-asc'>('date-desc');

  async function fetchFaculty() {
    const { data } = await supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name');
    setActiveFaculty(data ?? []);
  }
  async function fetchRemarks() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('faculty_remarks').select('*, faculty(full_name)');
      if (error) throw error;
      setAllRemarks((data as unknown as RemarkRow[]) ?? []);
    } catch {
      toast('Failed to load remarks.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFaculty();
    fetchRemarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSuggestions = useMemo(() => {
    const q = facultySearch.toLowerCase();
    if (!q) return [];
    return activeFaculty.filter((f) => f.full_name.toLowerCase().includes(q));
  }, [facultySearch, activeFaculty]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFacultyId) {
      toast('Please select a valid faculty member from the list.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('faculty_remarks').insert([{ date, start_time: startTime, end_time: endTime, faculty_id: selectedFacultyId, remark: remarkText }]);
      if (error) throw error;
      toast('Remark added successfully!', 'success');
      setDate(todayStr());
      setFacultySearch('');
      setSelectedFacultyId('');
      setStartTime('');
      setEndTime('');
      setRemarkText('');
      await fetchRemarks();
    } catch {
      toast('Failed to add remark. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this remark? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('faculty_remarks').delete().eq('id', id);
      if (error) throw error;
      toast('Remark deleted successfully!', 'success');
      setAllRemarks((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast('Failed to delete remark.', 'error');
    }
  }

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    const rows = allRemarks.filter((r) => {
      const facName = (r.faculty?.full_name || '').toLowerCase();
      const remarkTxt = (r.remark || '').toLowerCase();
      return facName.includes(q) || remarkTxt.includes(q);
    });
    rows.sort((a, b) => {
      if (sortBy === 'date-desc') return new Date(b.date + 'T' + (b.start_time || '00:00:00')).getTime() - new Date(a.date + 'T' + (a.start_time || '00:00:00')).getTime();
      if (sortBy === 'date-asc') return new Date(a.date + 'T' + (a.start_time || '00:00:00')).getTime() - new Date(b.date + 'T' + (b.start_time || '00:00:00')).getTime();
      if (sortBy === 'name-asc') return (a.faculty?.full_name || '').toLowerCase().localeCompare((b.faculty?.full_name || '').toLowerCase());
      return 0;
    });
    return rows;
  }, [allRemarks, search, sortBy]);

  function exportCsv() {
    if (allRemarks.length === 0) { toast('No data available to export.', 'warn'); return; }
    const headers = ['Date', 'Start Time', 'End Time', 'Faculty Name', 'Remark'];
    const rows = filteredSorted.map((r) => {
      const facName = r.faculty?.full_name || 'Unknown';
      const safeRemark = `"${r.remark.replace(/"/g, '""')}"`;
      return [r.date, r.start_time ?? '', r.end_time ?? '', `"${facName}"`, safeRemark];
    });
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Faculty_Remarks_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Faculty Remarks</h1>
          <p className="page-subtitle">Manage and view extra faculty activity logs.</p>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>Add New Remark</h3>
          <form className="grid-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Date</label>
              <input type="date" className="form-control" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Faculty</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Type to search faculty..."
                  autoComplete="off"
                  required
                  value={facultySearch}
                  onChange={(e) => { setFacultySearch(e.target.value); setSelectedFacultyId(''); setSuggestionsOpen(true); }}
                  onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                />
                <ul className={`suggestions-list${suggestionsOpen && facultySearch ? ' active' : ''}`}>
                  {filteredSuggestions.length === 0 ? (
                    <li style={{ color: 'var(--text-muted)' }}>No faculty found</li>
                  ) : (
                    filteredSuggestions.map((f) => (
                      <li key={f.id} onClick={() => { setFacultySearch(f.full_name); setSelectedFacultyId(f.id); setSuggestionsOpen(false); }}>
                        {f.full_name}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input type="time" className="form-control" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="time" className="form-control" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label>Remark</label>
              <textarea className="form-control" rows={3} required placeholder="Enter details about the extra activity..." value={remarkText} onChange={(e) => setRemarkText(e.target.value)} />
            </div>
            <div className="form-actions full-width" style={{ marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }} disabled={saving}>Save Remark</button>
            </div>
          </form>
        </div>

        <div className="card remarks-log-card">
          <div className="table-header-flex">
            <h3>Remarks Log</h3>
            <div className="table-controls">
              <input type="text" className="control-input" placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="control-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name-asc">Faculty (A-Z)</option>
              </select>
              <button className="btn-export" onClick={exportCsv}>
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Export CSV
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Time</th><th>Faculty</th><th>Remark</th><th style={{ width: 80, textAlign: 'center' }}>Actions</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading remarks...</td></tr>
                ) : filteredSorted.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No matching remarks found.</td></tr>
                ) : (
                  filteredSorted.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></td>
                      <td>{formatTime(r.start_time)} - {formatTime(r.end_time)}</td>
                      <td>{r.faculty?.full_name || <span style={{ color: 'var(--text-muted)' }}>Unknown</span>}</td>
                      <td>{r.remark}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn-action-icon delete" title="Delete Remark" onClick={() => handleDelete(r.id)}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
