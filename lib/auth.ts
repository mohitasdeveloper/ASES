import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'super_admin' | 'faculty';

export interface Profile {
  role: Role;
  full_name: string;
  is_active: boolean;
}

export interface Session {
  user: { id: string; email: string | null };
  role: Role;
  profile: Profile;
}

/**
 * ASES — Session & Role Guard (Server-side)
 * Ported from js/auth/session.js. Role is stored across two tables:
 *   admin_users (id uuid FK -> auth.users, role text, full_name text, is_active bool)
 *   faculty     (supabase_uid uuid FK -> auth.users, full_name text, is_active bool)
 *
 * Call getSession() at the top of any Server Component page that needs
 * to know who's logged in. Call requireRole() when the page should
 * redirect unauthenticated/wrong-role users away — this now happens
 * on the SERVER before any HTML is sent, instead of a client-side
 * redirect-after-flash like the old vanilla version.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // 1. Check if the user is an Admin
  const { data: adminData } = await supabase
    .from('admin_users')
    .select('role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (adminData) {
    return {
      user: { id: user.id, email: user.email ?? null },
      role: adminData.role as Role,
      profile: adminData as Profile,
    };
  }

  // 2. If not an Admin, check if the user is Faculty
  const { data: facultyData } = await supabase
    .from('faculty')
    .select('full_name, is_active')
    .eq('supabase_uid', user.id)
    .maybeSingle();

  if (facultyData) {
    return {
      user: { id: user.id, email: user.email ?? null },
      role: 'faculty',
      profile: { role: 'faculty', full_name: facultyData.full_name, is_active: facultyData.is_active },
    };
  }

  return null;
}

/**
 * Require any authenticated user with a known role.
 * If `role` is provided, also enforce that specific role
 * ('admin' also allows 'super_admin').
 */
export async function requireRole(role?: 'admin' | 'faculty'): Promise<Session> {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  if (role === 'admin' && session.role !== 'admin' && session.role !== 'super_admin') {
    redirect(session.role === 'faculty' ? '/faculty-portal' : '/');
  }

  if (role === 'faculty' && session.role !== 'faculty') {
    redirect('/dashboard');
  }

  return session;
}

export function redirectByRole(role: Role): string {
  return role === 'faculty' ? '/faculty-portal' : '/dashboard';
}
