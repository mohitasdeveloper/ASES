import { requireRole } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import '../theme.css';

export default async function SharedLayout({ children }: { children: React.ReactNode }) {
  // No role restriction — any authenticated user (admin or faculty) may access.
  const session = await requireRole();

  return (
    <>
      <Sidebar session={session} />
      <main className="main">{children}</main>
    </>
  );
}
