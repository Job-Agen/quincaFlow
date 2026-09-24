'use client';
import { usePathname } from 'next/navigation';
import { SessionProvider, useSession } from '@/client/session';
import CommerceApp from '@/local/LocalApp';
import { pageFor } from '@/local/navigation';
function ConnectedPage({ children }) {
  const { status } = useSession();
  if (status !== 'authenticated') return <p role="status">Connexion à votre boutique…</p>;
  return children;
}
export default function ClientRoot({ children }) {
  const pathname = usePathname();
  if (['/login', '/register'].includes(pathname))
    return <SessionProvider>{children}</SessionProvider>;
  return (
    <CommerceApp pathname={pathname}>
      {pageFor(pathname) === 'detail' ? (
        <SessionProvider>
          <ConnectedPage>{children}</ConnectedPage>
        </SessionProvider>
      ) : null}
    </CommerceApp>
  );
}
