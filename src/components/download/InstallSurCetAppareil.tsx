'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { MonitorDown } from 'lucide-react';

/**
 * Installe l'application web sur l'appareil qui consulte la page.
 *
 * C'est la « version bureau » : Chrome et Edge savent poser un site muni d'un
 * manifeste dans le menu Démarrer ou le Dock, avec sa propre fenêtre, sans
 * barre d'adresse et avec son icône. Rien n'est téléchargé — c'est le même site
 * — mais pour le gérant, c'est une application de plus sur son ordinateur.
 *
 * Le navigateur ne laisse pas déclencher cette installation quand on veut : il
 * émet `beforeinstallprompt` quand il la juge possible, et c'est le seul moment
 * où l'on peut garder la main dessus. D'où ce bouton qui n'existe que si
 * l'événement est venu : afficher un bouton d'installation que le navigateur
 * refusera ensuite d'honorer serait pire que ne rien afficher.
 *
 * Firefox et Safari n'émettent pas cet événement ; la page explique alors le
 * geste manuel, qui reste possible dans leurs menus.
 */

/** La part de `BeforeInstallPromptEvent` que l'on utilise — le type n'est pas standard. */
interface InvitePwa extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Vrai quand la page tourne déjà dans sa propre fenêtre.
 *
 * `useSyncExternalStore` plutôt qu'un état posé depuis un effet : le rendu du
 * serveur ne connaît pas `window`, et corriger l'état après coup provoque un
 * rendu de plus — que React signale, à raison, comme un effet qui écrit dans
 * l'état qu'il vient de lire.
 */
function useModeApplication(): boolean {
  const souscrire = useCallback((prevenir: () => void) => {
    const requete = window.matchMedia('(display-mode: standalone)');
    requete.addEventListener('change', prevenir);
    return () => requete.removeEventListener('change', prevenir);
  }, []);
  return useSyncExternalStore(
    souscrire,
    () => window.matchMedia('(display-mode: standalone)').matches,
    // Côté serveur, on suppose le navigateur ordinaire : la page propose alors
    // l'installation, ce qui est le cas le plus fréquent et le moins gênant.
    () => false
  );
}

export default function InstallSurCetAppareil() {
  const [invite, setInvite] = useState<InvitePwa | null>(null);
  const [posee, setPosee] = useState(false);
  const installee = useModeApplication() || posee;

  useEffect(() => {
    function retenir(event: Event) {
      // Sans cela, Chrome affiche sa propre barre d'installation, qu'on ne peut
      // ni placer ni traduire.
      event.preventDefault();
      setInvite(event as InvitePwa);
    }
    function poser() {
      setPosee(true);
      setInvite(null);
    }
    window.addEventListener('beforeinstallprompt', retenir);
    window.addEventListener('appinstalled', poser);
    return () => {
      window.removeEventListener('beforeinstallprompt', retenir);
      window.removeEventListener('appinstalled', poser);
    };
  }, []);

  if (installee) {
    return <p className="small muted">L’application est déjà installée sur cet appareil.</p>;
  }

  if (!invite) {
    return (
      <p className="small muted">
        Votre navigateur ne propose pas l’installation automatique. Dans Chrome ou Edge, ouvrez le
        menu <strong>⋮</strong> puis « Installer MaQuincaillerie ». Dans Safari, utilisez « Partager
        » puis « Ajouter au Dock ».
      </p>
    );
  }

  return (
    <button
      type="button"
      className="btn btn--soft btn--block"
      onClick={async () => {
        await invite.prompt();
        const { outcome } = await invite.userChoice;
        // Une invitation ne se rejoue pas : le navigateur en émettra une autre.
        setInvite(null);
        if (outcome === 'accepted') setPosee(true);
      }}
    >
      <MonitorDown size={18} />
      Installer sur cet ordinateur
    </button>
  );
}
