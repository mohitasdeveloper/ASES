import { redirect } from 'next/navigation';
import { getSession, redirectByRole } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';
import './login.css';

export const metadata = {
  title: 'B. K. Birla College — ASES Login',
};

export default async function LoginPage() {
  // SSR: if a valid session cookie already exists, skip the login
  // screen entirely and redirect server-side before any HTML ships.
  const session = await getSession();
  if (session) {
    redirect(redirectByRole(session.role));
  }

  return <LoginForm />;
}
