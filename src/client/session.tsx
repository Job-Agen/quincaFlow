'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from './api';
import type { BusinessRow, Profile, Role, UserRow } from '@/types';

/**
 * Session courante, partagée par toute l'application.
 *
 * Le jeton vit dans un cookie HttpOnly que le JavaScript ne peut pas lire :
 * savoir « qui est connecté » passe donc par un appel à /api/auth/me au premier
 * rendu. Tant que la réponse n'est pas revenue, l'état est « inconnu » — et non
 * « déconnecté » — pour éviter de renvoyer vers l'écran de connexion un
 * utilisateur qui a bien une session valide.
 */

/** Ce que tout écran lit de la session courante. */
export interface SessionValue {
  status: 'loading' | 'authenticated' | 'anonymous';
  profile: Profile | null;
  user: UserRow | null;
  business: BusinessRow | null;
  role: Role | null;
  isOwner: boolean;
  currency: string;
  reload: () => void;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const PUBLIC_ROUTES = ['/login', '/register'];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    status: SessionValue['status'];
    profile: Profile | null;
  }>({ status: 'loading', profile: null });
  const [nonce, setNonce] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    api
      .get<Profile>('/api/auth/me')
      .then((profile) => {
        if (!cancelled) setState({ status: 'authenticated', profile });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'anonymous', profile: null });
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // La redirection est faite ici plutôt que dans chaque page : une seule règle,
  // appliquée partout, évite qu'un écran oublié reste accessible sans session.
  useEffect(() => {
    if (state.status === 'loading') return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (state.status === 'anonymous' && !isPublic) router.replace('/login');
    if (state.status === 'authenticated' && isPublic) router.replace('/dashboard');
  }, [state.status, pathname, router]);

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
      user: state.profile?.user || null,
      business: state.profile?.business || null,
      role: state.profile?.role || null,
      isOwner: state.profile?.role === 'OWNER',
      currency: state.profile?.business?.currency || 'FCFA',
      reload: () => setNonce((current) => current + 1),
      setProfile: (profile: Profile) => setState({ status: 'authenticated', profile }),
      signOut: async () => {
        await api.post('/api/auth/logout').catch(() => {});
        setState({ status: 'anonymous', profile: null });
        router.replace('/login');
      },
    }),
    [state, router]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession doit être utilisé dans un SessionProvider.');
  return context;
}
