'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker, qui rend l'application installable.
 *
 * Sans lui, Android n'affiche pas « Ajouter à l'écran d'accueil » : le manifeste
 * seul ne suffit pas, il faut aussi un service worker qui réponde aux requêtes.
 *
 * L'enregistrement est repoussé après le chargement de la page : lancé plus tôt,
 * il se disputerait la bande passante avec l'écran que le gérant attend, et sur
 * une connexion de quincaillerie ce sont des secondes qui se voient.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    // En développement, le service worker servirait des fragments périmés à
    // chaque rechargement à chaud : il n'a sa place qu'en production.
    if (process.env.NODE_ENV !== 'production') return undefined;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Un échec d'enregistrement ne doit rien casser : l'application
        // fonctionne sans, elle n'est simplement plus installable.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
