'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Lecture d'une ressource d'API.
 *
 * `query` est sérialisé pour servir de dépendance : passer l'objet lui-même
 * relancerait la requête à chaque rendu, un littéral fraîchement créé n'étant
 * jamais égal au précédent.
 *
 * L'état retenu porte la clé qui l'a produit. C'en est le cœur : `loading` s'en
 * déduit — les données affichées ne correspondent pas encore à la requête
 * demandée — et les données précédentes restent visibles pendant qu'une nouvelle
 * recherche se charge, plutôt que de faire clignoter la liste à chaque lettre.
 * Une réponse arrivée après un démontage ou doublée par une requête plus récente
 * est ignorée.
 */
export function useResource(path, query, { enabled = true } = {}) {
  const key = JSON.stringify(query ?? null);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ data: null, error: null, key: null });

  useEffect(() => {
    if (!path || !enabled) return undefined;
    let cancelled = false;
    api
      .get(path, JSON.parse(key))
      .then((data) => {
        if (!cancelled) setState({ data, error: null, key });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error, key });
      });
    return () => {
      cancelled = true;
    };
  }, [path, key, enabled, nonce]);

  const setData = useCallback((data) => setState({ data, error: null, key }), [key]);

  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: enabled && state.key !== key,
    reload: useCallback(() => setNonce((current) => current + 1), []),
    setData,
  };
}
