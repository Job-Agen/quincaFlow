import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearSession, readRefreshToken, refreshSession, signOut as fermer } from './api';
import type { Profile } from '@/types';

/**
 * Session de l'application mobile (§7, §41).
 *
 * L'état reprend la distinction que le web a déjà payée une fois : un serveur
 * qui répond « cette session ne vaut plus » et un serveur qu'on n'a pas pu
 * joindre ne sont pas le même événement. Les confondre renverrait le gérant à
 * l'écran de connexion à la moindre coupure — et l'inviterait à ressaisir un mot
 * de passe que personne n'est là pour vérifier.
 */
type Statut = 'loading' | 'authenticated' | 'anonymous' | 'unreachable';

interface ValeurSession {
  statut: Statut;
  profil: Profile | null;
  isOwner: boolean;
  currency: string;
  ouvrir: (profil: Profile) => void;
  fermerSession: () => Promise<void>;
  reessayer: () => void;
}

const Contexte = createContext<ValeurSession | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [statut, setStatut] = useState<Statut>('loading');
  const [profil, setProfil] = useState<Profile | null>(null);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    let annule = false;

    (async () => {
      // Au lancement, seul le refresh token a survécu : l'access token ne vit
      // qu'en mémoire, et l'application vient d'être ouverte.
      const jeton = await readRefreshToken();
      if (annule) return;
      if (!jeton) {
        setStatut('anonymous');
        return;
      }

      try {
        const rouvert = await refreshSession();
        if (annule) return;
        if (!rouvert) {
          setStatut('anonymous');
          return;
        }
        const fiche = await api.get<Profile>('/api/auth/me');
        if (annule) return;
        setProfil(fiche);
        setStatut('authenticated');
      } catch {
        if (annule) return;
        // Le jeton est toujours là : c'est le réseau qui manque, pas la session.
        setStatut('unreachable');
      }
    })();

    return () => {
      annule = true;
    };
  }, [essai]);

  const ouvrir = useCallback((fiche: Profile) => {
    setProfil(fiche);
    setStatut('authenticated');
  }, []);

  const fermerSession = useCallback(async () => {
    await fermer();
    setProfil(null);
    setStatut('anonymous');
  }, []);

  const reessayer = useCallback(() => setEssai((n) => n + 1), []);

  return (
    <Contexte.Provider
      value={{
        statut,
        profil,
        isOwner: profil?.role === 'OWNER',
        currency: profil?.business.currency || 'FCFA',
        ouvrir,
        fermerSession,
        reessayer,
      }}
    >
      {children}
    </Contexte.Provider>
  );
}

export function useSession(): ValeurSession {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('useSession doit être appelé sous SessionProvider.');
  return valeur;
}

/** Vide la session sans passer par le serveur — utile si le coffre est corrompu. */
export const oublierSession = clearSession;
