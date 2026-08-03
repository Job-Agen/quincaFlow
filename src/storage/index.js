// Couche de persistance locale (localStorage), SSR-safe.
// Un écouteur optionnel est notifié à chaque écriture pour permettre le miroir Neon Postgres.
// `setSilent` écrit sans notifier (utilisé par l'hydratation pour éviter les boucles).

let changeListener = null;

/** Enregistre l'écouteur de changement (une seule fonction). Retourne un désabonnement. */
export function onStorageChange(cb) {
  changeListener = cb;
  return () => {
    if (changeListener === cb) changeListener = null;
  };
}

function notify(key, value) {
  if (changeListener) {
    try {
      changeListener(key, value);
    } catch {
      // ne jamais casser l'UI à cause du miroir
    }
  }
}

const storage = {
  get(key, fallback) {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota / serialization errors
    }
    notify(key, value);
  },
  // Écrit sans notifier l'écouteur (hydratation depuis Neon).
  setSilent(key, value) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  },
  remove(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    notify(key, null);
  },
};

export default storage;
