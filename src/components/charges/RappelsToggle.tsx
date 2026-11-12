'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Notice } from '@/components/ui';
import {
  activerRappels,
  couperRappels,
  etatRappels,
  type EtatRappels,
} from '@/client/rappels';

/**
 * Le bouton qui branche les rappels sur cet appareil (§68).
 *
 * « Sur cet appareil » et non « pour moi » : c'est un navigateur qu'on abonne.
 * Le gérant qui ouvre l'application sur son téléphone et sur l'ordinateur de
 * la boutique doit le faire deux fois, et c'est ce que le libellé annonce —
 * sans quoi il croirait avoir activé ce qui ne l'est qu'à moitié.
 */
const PHRASES: Record<EtatRappels, string> = {
  impossible: 'Ce navigateur ne sait pas recevoir de notifications.',
  'non-configure': 'Les rappels ne sont pas encore configurés sur le serveur.',
  refuse:
    'Vous avez refusé les notifications pour ce site. Réautorisez-les dans les réglages du navigateur.',
  actif: 'Vous serez prévenu sur cet appareil le jour de l’échéance.',
  inactif: 'Activez pour être prévenu le jour de l’échéance, même application fermée.',
  inconnu: 'État des rappels indisponible.',
};

export default function RappelsToggle() {
  const [etat, setEtat] = useState<EtatRappels>('inconnu');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    etatRappels().then((lu) => {
      if (vivant) setEtat(lu);
    });
    return () => {
      vivant = false;
    };
  }, []);

  async function basculer() {
    setBusy(true);
    setErreur(null);
    try {
      setEtat(etat === 'actif' ? await couperRappels() : await activerRappels());
    } catch (souci) {
      // Le service de distribution peut être injoignable — un réseau de
      // comptoir, un pare-feu —, ou le service worker pas encore prêt. La
      // phrase du dessous est relayée quand il y en a une : elle dit quoi
      // faire, là où « réessayez plus tard » ne dit rien.
      setErreur(
        souci instanceof Error && souci.message
          ? souci.message
          : 'Impossible de joindre le service de notifications. Réessayez plus tard.'
      );
    }
    setBusy(false);
  }

  const activable = etat === 'actif' || etat === 'inactif';

  return (
    <>
      {erreur ? <Notice tone="error">{erreur}</Notice> : null}
      <button
        type="button"
        className="rappels"
        disabled={busy || !activable}
        aria-pressed={etat === 'actif'}
        onClick={basculer}
      >
        <span className={`rappels__icone${etat === 'actif' ? ' rappels__icone--on' : ''}`}>
          {etat === 'actif' ? <Bell size={19} /> : <BellOff size={19} />}
        </span>
        <span className="rappels__corps">
          <span className="rappels__titre">
            {etat === 'actif' ? 'Rappels activés sur cet appareil' : 'Me prévenir sur cet appareil'}
          </span>
          <span className="rappels__detail">{busy ? 'Un instant…' : PHRASES[etat]}</span>
        </span>
      </button>
    </>
  );
}
