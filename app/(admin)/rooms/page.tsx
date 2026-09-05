'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, exportToPDF, preloadLogoForPDF } from '@/lib/exportHelpers';
import { useToast, ToastContainer } from '@/components/Toast';
import '../list-page.css';

interface Room {
  id: string;
  room_code: string;
  capacity: number | null;
  is_active: boolean;
}

type SortDir = 'asc' | 'desc';

export default function RoomsPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [capacity, setCapacity] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [generatedBy, setGeneratedBy] = useState('Admin');

  useEffect(() => {
    preloadLogoForPDF();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data } = await supabase
          .from('admin_users')
          .select('full_name')
          .eq('id', authData.user.id)
          .maybeSingle();
        if (data?.full_name) setGeneratedBy(data.full_name);
      }
    })();
  }, [supabase]);

  async function loadData() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase.from('rooms').select('id, room_code, capacity, is_active').order('room_code');
      if (error) throw error;
      setRooms(data || []);
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
    const rows = rooms.filter((r) => !fSearch || (r.room_code || '').toLowerCase().includes(fSearch));
    rows.sort((a, b) => {
      const cmp = (a.room_code || '').localeCompare(b.room_code || '', undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [rooms, search, sortDir]);

  function openModal(room: Room | null) {
    setCurrentId(room?.id ?? null);
    setRoomCode(room?.room_code ?? '');
    setCapacity(room?.capacity != null ? String(room.capacity) : '');
    setIsActive(room?.is_active ?? true);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setCurrentId(null);
  }

  async function handleSave() {
    const code = roomCode.trim();
    if (!code) {
      toast('Room Code is required', 'warn');
      return;
    }
    setSaving(true);
    try {
      const payload = { room_code: code, capacity: capacity.trim() ? parseInt(capacity, 10) : null, is_active: isActive };
      if (currentId) {
        const { error } = await supabase.from('rooms').update(payload).eq('id', currentId);
        if (error) throw error;
        toast('Room updated successfully');
      } else {
        const { error } = await supabase.from('rooms').insert(payload);
        if (error) throw error;
        toast('Room created successfully');
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
    const flat = filtered.map((r) => ({ code: r.room_code || '—', capacity: r.capacity ?? '—', status: r.is_active ? 'Active' : 'Inactive' }));
    exportToPDF(
      flat,
      [
        { header: 'Room Code', key: 'code', width: 50 },
        { header: 'Capacity', key: 'capacity', width: 30 },
        { header: 'Status', key: 'status', width: 40 },
      ],
      'Room List',
      'Rooms_Report',
      '',
      generatedBy
    );
  }
  function handleExportExcel() {
    if (!filtered.length) return toast('No data to export', 'warn');
    const flat = filtered.map((r) => ({ code: r.room_code || '—', capacity: r.capacity ?? '—', status: r.is_active ? 'Active' : 'Inactive' }));
    exportToExcel(
      flat,
      [
        { header: 'Room Code', key: 'code', width: 25 },
        { header: 'Capacity', key: 'capacity', width: 12 },
        { header: 'Status', key: 'status', width: 15 },
      ],
      'Rooms_Report'
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Rooms</h1>
          <p className="page-subtitle">Manage all college rooms and locations for timetables</p>
        </div>
      </div>

      <div className="content">
        <div className="filter-card">
          <div style={{ flex: 1 }}>
            <input
              type="text"
              className="table-search"
              placeholder="🔍 Search room code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="export-btns">
            <button className="btn-export" onClick={handleExportExcel}>Excel</button>
            <button className="btn-export" onClick={handleExportPdf}>PDF</button>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={() => openModal(null)}>
              + Add Room
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  Room Code
                </th>
                <th>Capacity</th>
                <th>Status</th>
                <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row">
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                    <span className="spin" /> Loading...
                  </td>
                </tr>
              ) : loadError ? (
                <tr className="empty-row">
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--error)' }}>
                    Error loading data
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No rooms match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, fontSize: '1rem' }}>{r.room_code || '—'}</td>
                    <td>{r.capacity ?? '—'}</td>
                    <td>
                      <span className={`badge ${r.is_active ? 'badge-active' : 'badge-inactive'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openModal(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`modal-back${modalOpen ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <div className="modal-title">{currentId ? 'Edit Room' : 'Add Room'}</div>
            <button
              className="btn-icon"
              style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={closeModal}
            >
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Room Code *</label>
              <input
                type="text"
                className="modal-input"
                placeholder="e.g. 101, 204A, Lab 1"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Capacity</label>
              <input
                type="number"
                min={0}
                className="modal-input"
                placeholder="e.g. 60"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="toggle-track" />
              </label>
              <label style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Active Room</label>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              Save Room
            </button>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
