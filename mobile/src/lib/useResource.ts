import { useCallback, useEffect, useState } from 'react';
import { api, type Query } from './api';

/**
 * Lecture d'une ressource d'API, reprise de `src/client/useResource.ts`.
 *
 * L'état retenu porte la clé qui l'a produit : `loading` s'en déduit, et les
 * données précédentes restent affichées pendant qu'une nouvelle recherche se
 * charge, plutôt que de faire clignoter la liste à chaque lettre. Une réponse
 * arrivée après un démontage, ou doublée par une requête plus récente, est
 * ignorée.
 */
export function useResource<T>(path: string | null, query?: Query | null) {
  const cle = JSON.stringify(query ?? null);
  const [nonce, setNonce] = useState(0);
  const [etat, setEtat] = useState<{ data: T | null; error: Error | null; cle: string | null }>({
    data: null,
    error: null,
    cle: null,
  });

  useEffect(() => {
    if (!path) return undefined;
    let annule = false;
    api
      .get<T>(path, JSON.parse(cle) as Query | null)
      .then((data) => {
        if (!annule) setEtat({ data, error: null, cle });
      })
      .catch((error: Error) => {
        if (!annule) setEtat({ data: null, error, cle });
      });
    return () => {
      annule = true;
    };
  }, [path, cle, nonce]);

  return {
    data: etat.data,
    error: etat.cle === cle ? etat.error : null,
    loading: etat.cle !== cle,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}
