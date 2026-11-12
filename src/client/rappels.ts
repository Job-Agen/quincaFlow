'use client';

/**
 * L'abonnement du navigateur aux rappels d'échéance (§68).
 *
 * Quatre choses peuvent manquer, et chacune se dit plutôt que d'échouer en
 * silence : le navigateur peut ne pas savoir recevoir de notifications, le
 * serveur peut ne pas avoir de clés, le gérant peut refuser l'autorisation, et
 * le service de distribution peut être injoignable. Un bouton qui ne fait rien
 * sans expliquer pourquoi fait conclure que l'application est cassée.
 */

export type EtatRappels =
  | 'impossible'
  | 'non-configure'
  | 'refuse'
  | 'actif'
  | 'inactif'
  | 'inconnu';

/**
 * La clé publique arrive en base64url ; l'API la veut en octets.
 *
 * Le tampon est alloué explicitement : `Uint8Array.from` rend une vue sur un
 * tampon dont le type ne satisfait pas `BufferSource`, et la conversion
 * échouerait à la compilation.
 */
function enOctets(base64url: string): ArrayBuffer {
  const complet = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(complet + '='.repeat((4 - (complet.length % 4)) % 4));
  const tampon = new ArrayBuffer(brut.length);
  const octets = new Uint8Array(tampon);
  for (let index = 0; index < brut.length; index += 1) octets[index] = brut.charCodeAt(index);
  return tampon;
}

/** Vrai si ce navigateur sait recevoir des notifications poussées. */
export function navigateurCapable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Le service worker, ou rien au bout du délai.
 *
 * `navigator.serviceWorker.ready` ne se résout **jamais** tant qu'aucun
 * service worker n'est actif — au premier chargement, le temps qu'il
 * s'installe, et toujours en développement où il n'est pas enregistré. Sans
 * cette borne, l'écran restait figé sur un bouton mort, ce qui est
 * précisément ce qu'on voulait éviter.
 */
function prete(delai = 3000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resoudre) => setTimeout(() => resoudre(null), delai)),
  ]);
}

async function abonnementCourant(): Promise<PushSubscription | null> {
  const enregistrement = await prete();
  return enregistrement ? enregistrement.pushManager.getSubscription() : null;
}

/**
 * L'état actuel, sans rien demander ni rien changer.
 *
 * Appelé au premier rendu : l'écran doit savoir quoi montrer avant que le
 * gérant ne touche à rien.
 */
export async function etatRappels(): Promise<EtatRappels> {
  if (!navigateurCapable()) return 'impossible';
  try {
    const reponse = await fetch('/api/push/subscribe');
    if (!reponse.ok) return 'inconnu';
    const { disponible } = (await reponse.json()) as { disponible: boolean };
    if (!disponible) return 'non-configure';
  } catch {
    return 'inconnu';
  }
  if (Notification.permission === 'denied') return 'refuse';
  // Abonnement introuvable *ou* service worker pas encore prêt : dans les deux
  // cas on propose d'activer. Rendre le bouton inerte parce qu'on n'a pas su
  // lire l'état serait punir le gérant d'une lenteur qui n'est pas la sienne.
  return (await abonnementCourant()) ? 'actif' : 'inactif';
}

/**
 * Abonne ce navigateur, en demandant l'autorisation si besoin.
 *
 * L'abonnement est envoyé au serveur **après** avoir été obtenu : enregistrer
 * d'abord et s'abonner ensuite laisserait, au moindre refus, une adresse en
 * base vers laquelle rien ne partirait jamais.
 */
export async function activerRappels(): Promise<EtatRappels> {
  if (!navigateurCapable()) return 'impossible';

  const reponse = await fetch('/api/push/subscribe');
  const { disponible, cle } = (await reponse.json()) as {
    disponible: boolean;
    cle: string | null;
  };
  if (!disponible || !cle) return 'non-configure';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'refuse' : 'inactif';

  const enregistrement = await prete(8000);
  if (!enregistrement) {
    throw new Error(
      'Le service de notifications n’est pas encore prêt. Rechargez la page et réessayez.'
    );
  }
  const abonnement =
    (await enregistrement.pushManager.getSubscription()) ??
    (await enregistrement.pushManager.subscribe({
      // Exigé par les navigateurs : une notification poussée doit toujours
      // être montrée. Pas de réveil silencieux de l'application.
      userVisibleOnly: true,
      applicationServerKey: enOctets(cle),
    }));

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: abonnement.toJSON() }),
  });
  return 'actif';
}

/**
 * Désabonne ce navigateur.
 *
 * Des deux côtés : le navigateur cesse d'écouter, et le serveur cesse
 * d'envoyer. Ne faire que l'un laisserait soit des notifications qu'on ne
 * reçoit plus mais qui partent, soit l'inverse.
 */
export async function couperRappels(): Promise<EtatRappels> {
  if (!navigateurCapable()) return 'impossible';
  const abonnement = await abonnementCourant();
  if (!abonnement) return 'inactif';

  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: abonnement.endpoint }),
  }).catch(() => {});
  await abonnement.unsubscribe().catch(() => {});
  return 'inactif';
}
