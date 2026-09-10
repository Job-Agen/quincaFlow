'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from './api';

/**
 * Session courante, partagée par toute l'application.
 *
 * Le jeton vit dans un cookie HttpOnly que le JavaScript ne peut pas lire :
 * savoir « qui est connecté » passe donc par un appel à /api/auth/me au premier
 * rendu. Tant que la réponse n'est pas revenue, l'état est « inconnu » — et non
 * « déconnecté » — pour éviter de renvoyer vers l'écran de connexion un
 * utilisateur qui a bien une session valide.
 */

const SessionContext = createContext(null);

const PUBLIC_ROUTES = ['/login', '/register'];

export function SessionProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', profile: null });
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const profile = await api.get('/api/auth/me');
      setState({ status: 'authenticated', profile });
      return profile;
    } catch {
      setState({ status: 'anonymous', profile: null });
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // La redirection est faite ici plutôt que dans chaque page : une seule règle,
  // appliquée partout, évite qu'un écran oublié reste accessible sans session.
  useEffect(() => {
    if (state.status === 'loading') return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (state.status === 'anonymous' && !isPublic) router.replace('/login');
    if (state.status === 'authenticated' && isPublic) router.replace('/');
  }, [state.status, pathname, router]);

  const value = useMemo(
    () => ({
      ...state,
      user: state.profile?.user || null,
      business: state.profile?.business || null,
      role: state.profile?.role || null,
      isOwner: state.profile?.role === 'OWNER',
      currency: state.profile?.business?.currency || 'FCFA',
      reload: load,
      setProfile: (profile) => setState({ status: 'authenticated', profile }),
      signOut: async () => {
        await api.post('/api/auth/logout').catch(() => {});
        setState({ status: 'anonymous', profile: null });
        router.replace('/login');
      },
    }),
    [state, load, router]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession doit être utilisé dans un SessionProvider.');
  return context;
}
