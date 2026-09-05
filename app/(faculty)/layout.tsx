import { requireRole } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import '../theme.css';

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('faculty');

  return (
    <>
      <Sidebar session={session} />
      <main className="main">{children}</main>
    </>
  );
}
