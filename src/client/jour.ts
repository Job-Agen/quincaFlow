'use client';

import { useEffect, useState } from 'react';

/**
 * Le jour courant, et son renouvellement (§70).
 *
 * Un décompte qui ne bouge qu'au rechargement n'est pas un décompte. Une
 * application de comptoir reste ouverte des heures sur le même écran : il
 * faut que le nombre passe de 12 à 11 pendant qu'on la regarde, sans que le
 * gérant ait à faire quoi que ce soit.
 */

/** Aujourd'hui en `YYYY-MM-DD`, comme la base range les dates. */
export function jourCourant(): string {
  const jour = new Date();
  return `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(
    jour.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Le jour courant, relu à chaque minuit.
 *
 * Le minuteur vise minuit plus deux secondes : viser minuit pile relirait
 * parfois l'horloge une milliseconde trop tôt, et le décompte resterait sur
 * la veille jusqu'au lendemain.
 */
export function useJour(): string {
  const [jour, setJour] = useState(jourCourant);

  useEffect(() => {
    let minuteur: ReturnType<typeof setTimeout>;

    const replanifier = () => {
      setJour((precedent) => {
        const actuel = jourCourant();
        return actuel === precedent ? precedent : actuel;
      });
      const maintenant = new Date();
      const minuit = new Date(
        maintenant.getFullYear(),
        maintenant.getMonth(),
        maintenant.getDate() + 1,
        0,
        0,
        2,
        0
      );
      minuteur = setTimeout(replanifier, Math.max(1000, minuit.getTime() - maintenant.getTime()));
    };

    replanifier();

    // Un onglet endormi ne reçoit pas son minuteur à l'heure : le téléphone
    // posé sur le comptoir toute la nuit rouvrirait sur la veille. Au retour,
    // on relit l'horloge plutôt que de faire confiance au minuteur.
    const auRetour = () => {
      if (!document.hidden) {
        clearTimeout(minuteur);
        replanifier();
      }
    };
    document.addEventListener('visibilitychange', auRetour);

    return () => {
      clearTimeout(minuteur);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, []);

  return jour;
}
