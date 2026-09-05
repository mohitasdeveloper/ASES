import { requireRole } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import '../theme.css';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side role guard: runs before any HTML is sent, so there's
  // no client-side redirect flash like the old requireRole('admin') did.
  const session = await requireRole('admin');

  return (
    <>
      <Sidebar session={session} />
      <main className="main">{children}</main>
    </>
  );
}
