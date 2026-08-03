'use client';

import storage from '../storage';
import { SYNCED_KEYS } from './syncConfig';

/**
 * Télécharge toutes les données de l'utilisateur depuis Neon (via l'API Next.js)
 * et les écrit dans le localStorage (écriture "silencieuse" : ne redéclenche pas de push).
 * Retourne { ok, error? }.
 */
export async function pullAll() {
  try {
    const res = await fetch('/api/sync/pull', { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || 'Erreur lors de la synchronisation' };
    }

    const { data } = await res.json();
    if (!data) return { ok: false, error: 'Données absentes' };

    for (const { key, kind } of SYNCED_KEYS) {
      const val = data[key];
      if (kind === 'object') {
        if (val) storage.setSilent(key, val);
      } else {
        storage.setSilent(key, Array.isArray(val) ? val : []);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Pousse la valeur d'une clé localStorage vers la base Neon (via l'API Next.js).
 */
export async function pushKey(key, value) {
  try {
    const res = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || 'Erreur de mise à jour' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Efface toutes les clés qp_* du localStorage (à la déconnexion). */
export function clearLocalData() {
  for (const { key } of SYNCED_KEYS) {
    storage.remove(key);
  }
}
