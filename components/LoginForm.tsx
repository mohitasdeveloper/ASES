'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{ msg: string; type: 'error' | 'success' | '' }>({ msg: '', type: '' });
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const year = useRef(new Date().getFullYear()).current;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email address and password.');
      return;
    }

    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        if (
          signInError.message.includes('Invalid login credentials') ||
          signInError.message.includes('invalid_grant')
        ) {
          setError('Incorrect email or password. Please try again.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Your email address has not been confirmed. Contact your administrator.');
        } else {
          setError(signInError.message);
        }
        setLoading(false);
        return;
      }

      // Ask the server which role this user has, then land on the right page.
      // Using router.refresh() + push ensures the server layout picks up
      // the new cookie-based session (real SSR, not a client-only redirect).
      const res = await fetch('/api/whoami');
      const { role } = await res.json();

      if (!role) {
        setError('Account profile not found or inactive. Contact your administrator.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      router.push(role === 'faculty' ? '/faculty-portal' : '/dashboard');
      router.refresh();
    } catch (err) {
      console.error('[ASES] Login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  }

  function openForgot() {
    setResetFeedback({ msg: '', type: '' });
    setResetEmail(email.trim());
    setResetSent(false);
    setForgotOpen(true);
  }

  async function sendReset() {
    if (!resetEmail.trim()) {
      setResetFeedback({ msg: 'Please enter your email address.', type: 'error' });
      return;
    }

    setResetSending(true);
    setResetFeedback({ msg: '', type: '' });

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/`,
      });

      if (resetError) {
        setResetFeedback({ msg: resetError.message, type: 'error' });
      } else {
        setResetFeedback({
          msg: 'Reset link sent! Check your inbox (and spam folder) for the email.',
          type: 'success',
        });
        setResetSent(true);
      }
    } catch {
      setResetFeedback({ msg: 'Failed to send reset email. Please try again.', type: 'error' });
    } finally {
      setResetSending(false);
    }
  }

  return (
    <>
      {/* Left: Branding Panel */}
      <aside className="brand-panel">
        <div className="brand-top">
          <div className="brand-logo-group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://i.ibb.co/8D6qf9gg/tl.png"
              alt="B. K. Birla College Logo"
              className="college-logo"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="brand-text">
              <div className="brand-wordmark">B. K. Birla College, Kalyan</div>
              <div className="brand-submark">(Empowered Autonomous Status)</div>
              <div className="brand-dept">Department of Management Studies</div>
            </div>
          </div>
        </div>

        <div className="brand-middle">
          <div className="brand-divider" />
          <h1 className="brand-headline">
            Academic
            <br />
            Schedule
            <br />
            <em>Execution</em>
            <br />
            System
          </h1>
          <p className="brand-desc">
            Centralised timetable management, faculty scheduling, and daily lecture execution
            tracking for our institution.
          </p>
        </div>

        <div className="brand-bottom">&copy; {year} ASES &mdash; All rights reserved</div>
      </aside>

      {/* Right: Login Panel */}
      <main className="login-panel">
        <div className="login-card">
          <div className="card-header">
            <div className="card-eyebrow">Staff &amp; Faculty Portal</div>
            <h2 className="card-title">Welcome back</h2>
            <p className="card-subtitle">Sign in with your institutional credentials</p>
          </div>

          <div className={`error-banner${error ? ' visible' : ''}`} role="alert">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <div className="input-wrap">
                <span className="input-icon">
                  <svg viewBox="0 0 24 24">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <polyline points="2,4 12,14 22,4" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="you@bkbirlacollegekalyan.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <span className="input-icon">
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPw ? 'text' : 'password'}
                  id="password"
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPw((v) => !v)}
                >
                  <svg viewBox="0 0 24 24" style={{ display: showPw ? 'none' : 'block' }}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg viewBox="0 0 24 24" style={{ display: showPw ? 'block' : 'none' }}>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="forgot-wrap">
              <button type="button" className="link-forgot" onClick={openForgot}>
                Forgot your password?
              </button>
            </div>

            <button type="submit" className={`btn-login${loading ? ' loading' : ''}`} disabled={loading}>
              <div className="spinner" />
              <span className="btn-text">Sign in to ASES</span>
            </button>
          </form>

          <div className="card-footer">
            Access is restricted to authorised staff only.
            <br />
            Contact your system administrator if you need assistance.
          </div>
        </div>
      </main>

      {/* Forgot Password Modal */}
      <div
        className={`modal-backdrop${forgotOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) setForgotOpen(false);
        }}
      >
        <div className="modal">
          <h3 className="modal-title">Reset Password</h3>
          <p className="modal-desc">
            Enter your registered email address and we&apos;ll send you a link to reset your password.
          </p>

          <div className="field">
            <label htmlFor="resetEmail">Email address</label>
            <div className="input-wrap">
              <span className="input-icon">
                <svg viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <polyline points="2,4 12,14 22,4" />
                </svg>
              </span>
              <input
                type="email"
                id="resetEmail"
                placeholder="your@email.com"
                autoComplete="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
          </div>

          <div className={`modal-feedback${resetFeedback.type ? ` ${resetFeedback.type}` : ''}`}>
            {resetFeedback.msg}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setForgotOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={resetSending || resetSent}
              onClick={sendReset}
            >
              <div className="spinner" style={{ display: resetSending ? 'block' : 'none' }} />
              <span>{resetSending ? 'Sending…' : resetSent ? 'Sent' : 'Send Reset Link'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
