'use client';
import { usePathname } from 'next/navigation';
import { SessionProvider } from '@/client/session';
import AppShell from './AppShell';

export default function ClientRoot({ children }) {
  const pathname = usePathname();
  if (pathname === '/local') return children;
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
