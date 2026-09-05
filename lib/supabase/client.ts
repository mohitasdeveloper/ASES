'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * ASES — Supabase Browser Client
 * Use inside Client Components / hooks. Session is kept in cookies
 * (via @supabase/ssr) so the server can read it too — this is what
 * makes real SSR + route protection possible.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
