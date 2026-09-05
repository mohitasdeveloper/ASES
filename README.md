# ASES — Next.js (Migration in Progress)

This is the Next.js (App Router) conversion of the original vanilla-JS ASES app.
Same Supabase backend, same UI/UX, same `schema.sql` — only the frontend has moved.

## What's done (Phase 1)

- ✅ Project scaffold (Next.js 14, App Router, TypeScript)
- ✅ Supabase SSR auth (`@supabase/ssr`) — real server-side session checks via middleware,
  replacing the old client-side `requireRole()` redirect pattern
- ✅ Login page (`/`) — full port of `index.html`, including the forgot-password modal
- ✅ Shared Sidebar layout (`components/Sidebar.tsx`) — full port of `js/components/sidebar.js`,
  using Next.js `<Link>` for instant, no-refresh navigation
- ✅ Dashboard (`/dashboard`) — full port of `dashboard.html`, including live stats, the Flatpickr
  date picker, and the two live-updating lists
- ✅ Route protection: the `(admin)` and `(faculty)` route groups each have a server-side layout
  that calls `requireRole()` before rendering — wrong-role or logged-out users are redirected
  server-side, before any page HTML is sent
- 🚧 Remaining pages exist as placeholder routes (so navigation never 404s) and are scheduled
  for their migration phase — see below

## Phase 2 — Master Data (done)

- ✅ **Rooms** — full CRUD, search, sort, Excel/PDF export
- ✅ **Subjects** — full CRUD, search, sort, Excel/PDF export
- ✅ **Courses** — full CRUD (its own distinct card-based UI, matching the original)
- ✅ **CSF Mapping** — full CRUD linking Course × Subject × Faculty, with Tom Select dropdowns,
  filter-by-course/subject, search, sort, Excel/PDF export
- ✅ `lib/exportHelpers.ts` — Excel/PDF export with the college letterhead, shared across all
  export-enabled pages (dynamic-imports `xlsx`/`jspdf` so they don't bloat the initial bundle)
- ✅ `components/Toast.tsx` — shared toast notification system (replaces the repeated
  `toast()` DOM-append pattern from every original page)
- ✅ `components/TomSelectField.tsx` — reusable Tom Select wrapper for relational dropdowns

**Schema correction (from live Supabase SQL):** `rooms.capacity` added to the Rooms CRUD;
`subjects.subject_code` made required (matches its `NOT NULL UNIQUE` constraint);
`courses.year` restricted to `FY`/`SY`/`TY` and `courses.division` to `A`/`B`/`C` dropdown
(matches the live `CHECK` constraints) — the original HTML pages had drifted from the DB schema
on these points; this Next.js version now matches the database exactly.

## Phase 3 — Timetables (done)

- ✅ **Master Timetable** — the fixed weekly grid editor: day tabs (Mon–Sat), physical room ×
  time-slot grid, click-to-assign modal with cascading Tom Select (Course → Subject/Faculty via
  `course_subject_faculty`), a separate "Virtual lecture" section for flexible-time entries,
  clear-cell, and full Excel/PDF export matching the original's large-format printable layout
- ✅ **Weekly Timetable View** — read-only pivot view filterable by Course / Faculty / Room,
  Mon–Sat × time-slot grid built from `master_timetable`, virtual/flexible load section, Excel/PDF
  export
- ✅ `lib/masterTimetable.ts` — shared data layer (time slots, rooms, CSF lookup, upsert/clear)
  ported from `js/modules/masterTimetable.js`, used by the Master Timetable page

## Phase 4 — Daily Scheduling (done)

- ✅ **Daily Scheduler** — the day-of-week generator: Import-from-Master or Start-Blank flows,
  the danger-bar regenerate confirmation, the full physical + virtual grid with click-to-assign
  modal (absent/double-booked/resolved/cancelled cell states, cascading course → subject/faculty
  picker, cancel/restore/delete actions), the Faculty Remarks panel, and large-format Excel/PDF
  export — full port of `pages/daily-scheduler.html`
- ✅ **Execution Log** — click-a-cell-to-cycle-status grid (On Time → Late → Not Engaged → Not
  Marked), optimistic UI updates, stat chips, virtual lecture section, Excel/PDF export — full
  port of `pages/execution.html`

**A note on both pages:** these are the two heaviest, most stateful pages in the whole app — deep
grid state, several interacting modals, and large jsPDF/xlsx export routines. Please test them
thoroughly: generate a schedule, edit a few cells (absent/replace/cancel/restore), cycle execution
statuses, and try both exports, on real data before treating this phase as final.

## Phase 5 — Admin Tools & Faculty Portal (done, with one noted gap)

- ✅ **Leave Management** — quick "mark absent today", full leave record form, filterable/deletable
  records table — full port of `pages/leaves.html`
- ✅ **Faculty Remarks** — autocomplete faculty search, add/delete remarks, search + sort + CSV
  export — full port of `pages/remarks.html`
- ✅ **Reports** — all 10 of the original's report types are now fully ported: Daily Summary,
  Faculty Lectures, Not Engaged/Unmarked, By Course, By Subject, By Room, Rescheduled Slots, Leave
  Summary, Daily Execution Report grid (`rc1`), and the **Lecture Taken Report** (`rc2`) — the
  load-calculation report grouping scheduled/taken/late lecture counts by faculty type (full-time
  vs. visiting), with per-faculty subtotal rows and a grand total, matching the original's Excel/PDF
  export exactly. Uses a new `TomSelectMulti` component for the multi-select faculty filter.
  **Schema-drift fix**: the original's Faculty Type filter used the value `full_time` (with an
  underscore), which doesn't match your actual `faculty.faculty_type` column values (`fulltime`,
  `visiting` — no underscore) — so that filter silently matched nothing in the original. Fixed here
  to use the real column values.
- ✅ **Users** — Faculty and Admin tabs: create accounts (via the same Supabase Edge Function the
  original used), edit profiles, activate/deactivate, force password reset, change email, search/
  filter/sort, CSV export — full port of `pages/users.html`
- ✅ **Holidays** — declare/remove holidays, duplicate-date handling — full port of `pages/holidays.html`
- ✅ **Change Password** — moved to a new shared `(shared)` route group (not `(admin)`) since the
  original page is accessible to **both** admin and faculty roles, not just admins
- ✅ **Faculty Portal** — today's schedule timeline, recent executions, recent leave history, admin
  preview mode. **Bug fix from the original**: `faculty-portal.html` looked up the signed-in
  faculty member by a `user_id` column that doesn't exist in your schema (`faculty.supabase_uid`
  is the real column) — the original's email-fallback lookup masked this, but it was fragile. This
  version queries `supabase_uid` directly, matching your actual schema.

## Remaining work

| Item | Notes |
|---|---|
| Final polish pass | ✅ Done — see below |

All 17 original pages plus login are now fully ported (with the schema-drift bug fixes noted
above). Recommended before go-live: a full click-through on staging data, especially Reports
(`rc2`'s load-calculation numbers deserve a manual spot-check against the old app) and Users
(it hits your live Supabase Edge Function).

## Polish pass — what was checked

- Every `<Link>` in the sidebar resolves to a real page (no dead nav links)
- Every local `.css` import resolves to a file that exists
- Every `@/lib` and `@/components` import resolves correctly
- Every `.tsx`/`.ts` file has balanced braces/parens (35 files checked)
- Added the missing `.eslintrc.json` (present in every `create-next-app` scaffold; harmless to
  omit for `next build`, but keeps `npm run lint` working and matches standard project shape) —
  extends both `next/core-web-vitals` and `next/typescript` so the `@typescript-eslint/*` rules
  used by inline disable comments throughout the codebase actually resolve
- Moved the login page's Google Fonts `<link>` from the page body into the root layout's `<head>`,
  resolving a Next.js `no-page-custom-font` warning
- The Users page's Edge Function URL is now derived from `NEXT_PUBLIC_SUPABASE_URL` instead of
  being hardcoded — so it won't silently break if the Supabase project URL ever changes
- No stray `console.log`, `TODO`, or debug artifacts left in
- Confirmed all external hosts referenced (`i.ibb.co`, `fonts.googleapis.com`,
  `*.supabase.co`) are consistent with the `.env.local` project reference

## Known follow-ups (not bugs — just worth knowing)

- `rc2`'s load-calculation logic is genuinely intricate (see Phase 5/rc2 notes above) — spot-check
  its numbers against the old app before trusting it for anything official
- The `master_timetable` upsert in Master Timetable relies on a unique constraint on
  `(day_type, time_slot_id, room_id)` existing in your database — verify this if cell-saving
  ever throws a constraint error
- `courses.course_code` uniqueness — since `division` is now correctly restricted to A/B/C
  (previously unrestricted text), double-check existing data doesn't have course codes that
  assumed free-text divisions

## Setup

```bash
npm install
```

`.env.local` is already pre-filled with the Supabase project URL/anon key from the original
`js/config/supabase.js`. If you rotate keys, update `.env.local` (see `.env.local.example`
for the format).

```bash
npm run dev
```

Visit `http://localhost:3000`.

## Deploy

This is a standard Next.js app — deploys as-is to Vercel, Netlify, or any Node host:

```bash
npm run build
npm start
```

Set the two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in your
hosting platform's dashboard for production.

## Architecture notes

- **SSR & route protection**: `lib/auth.ts` (`getSession`, `requireRole`) runs on the server.
  `middleware.ts` refreshes the Supabase auth cookie on every request.
- **No-refresh navigation**: all internal links use Next.js `<Link>`, which is client-side
  routed automatically — no extra code needed for the smooth SPA-like feel.
- **Same UI/UX**: `app/theme.css` is the original `css/theme.css` verbatim (plus the sidebar
  styles that used to be injected by JS, now static). Page-specific `<style>` blocks from each
  original HTML file become `*.css` files next to their route.
- **Supabase**: `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (server) —
  same queries as the original `js/modules/*.js`, just called from React instead of
  `document.getElementById`.
