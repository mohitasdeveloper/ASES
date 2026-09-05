'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import './change-password.css';

const COLORS = ['#e05c6b', '#f5a623', '#4f6af5', '#3ecf8e'];
const LABELS = ['Too short', 'Fair', 'Good', 'Strong'];

function strengthScore(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

export default function ChangePasswordPage() {
  const supabase = createClient();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const score = strengthScore(newPw);
  const strengthLabel = newPw.length === 0 ? 'Minimum 8 characters' : LABELS[Math.max(0, score - 1)];
  const strengthColor = newPw.length === 0 ? 'var(--text-muted)' : COLORS[Math.max(0, score - 1)];

  let matchHint = '';
  let matchColor = '';
  if (confirmPw) {
    if (newPw === confirmPw) { matchHint = '✓ Passwords match'; matchColor = 'var(--success)'; }
    else { matchHint = '✗ Passwords do not match'; matchColor = 'var(--error)'; }
  }

  function hideMessages() {
    setError('');
    setSuccess(false);
  }

  async function handleSubmit() {
    hideMessages();
    if (!currentPw) { setError('Please enter your current password.'); return; }
    if (newPw.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setError('New passwords do not match.'); return; }
    if (newPw === currentPw) { setError('New password must be different from your current password.'); return; }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) { setError('Could not verify your account email.'); return; }

      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: currentPw });
      if (authErr) { setError('Current password is incorrect.'); return; }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) { setError(updateErr.message); return; }

      setSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Change Password</h1>
          <p className="page-subtitle">Update your account password at any time</p>
        </div>
      </div>

      <div className="content">
        <div className="form-card">
          <div className="card-eyebrow">Security</div>
          <div className="card-title">Update Password</div>
          <p className="card-desc">Enter a new password for your account. You&apos;ll use this next time you sign in.</p>

          {error && (
            <div className="msg-box error visible">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="msg-box success visible">
              <svg viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12" /></svg>
              <span>Password updated successfully.</span>
            </div>
          )}

          <div className="field">
            <label>Current Password <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', fontSize: '.72rem' }}>(for confirmation)</span></label>
            <div className="input-wrap">
              <span className="input-icon"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
              <input type={showCurrent ? 'text' : 'password'} placeholder="Your current password" autoComplete="current-password" value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); hideMessages(); }} />
              <button type="button" className="pw-toggle" onClick={() => setShowCurrent((v) => !v)}>
                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
            </div>
          </div>

          <hr className="divider" />

          <div className="field">
            <label>New Password</label>
            <div className="input-wrap">
              <span className="input-icon"><svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg></span>
              <input type={showNew ? 'text' : 'password'} placeholder="New password" autoComplete="new-password" value={newPw} onChange={(e) => { setNewPw(e.target.value); hideMessages(); }} />
              <button type="button" className="pw-toggle" onClick={() => setShowNew((v) => !v)}>
                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
            </div>
            <div className="strength-bar">
              {[0, 1, 2, 3].map((i) => (
                <div className="strength-seg" key={i} style={{ background: i < score ? COLORS[score - 1] : 'var(--border)' }} />
              ))}
            </div>
            <div className="strength-label" style={{ color: strengthColor }}>{strengthLabel}</div>
          </div>

          <div className="field">
            <label>Confirm New Password</label>
            <div className="input-wrap">
              <span className="input-icon"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
              <input type={showConfirm ? 'text' : 'password'} placeholder="Repeat new password" autoComplete="new-password" value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); hideMessages(); }} />
              <button type="button" className="pw-toggle" onClick={() => setShowConfirm((v) => !v)}>
                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
            </div>
            <div className="field-hint" style={{ color: matchColor }}>{matchHint}</div>
          </div>

          <button className="btn-submit" disabled={saving} onClick={handleSubmit}>
            {saving && <span className="spin" style={{ display: 'inline-block', borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} />}
            <span>{saving ? 'Updating…' : 'Update Password'}</span>
          </button>

          <div className="security-note">
            <strong>Note:</strong> Supabase securely updates your password. Your current password is not re-verified server-side here — it is shown for user clarity only. After updating, you will remain signed in.
          </div>
        </div>
      </div>
    </>
  );
}
