'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Lecture d'une ressource d'API, avec état de chargement et rechargement.
 *
 * `query` est sérialisé pour servir de dépendance : passer l'objet lui-même
 * relancerait la requête à chaque rendu, puisqu'un littéral fraîchement créé
 * n'est jamais égal au précédent. Une réponse arrivée après le démontage du
 * composant est ignorée, de même qu'une réponse périmée doublée par une
 * recherche plus récente.
 */
export function useResource(path, query, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const key = JSON.stringify(query ?? null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!path || !enabled) return;
    const ticket = ++latest.current;
    setState((current) => ({ ...current, loading: true }));
    try {
      const data = await api.get(path, JSON.parse(key));
      if (ticket === latest.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (ticket === latest.current) setState({ data: null, error, loading: false });
    }
  }, [path, key, enabled]);

  useEffect(() => {
    reload();
    return () => {
      latest.current += 1;
    };
  }, [reload]);

  return { ...state, reload, setData: (data) => setState({ data, error: null, loading: false }) };
}
