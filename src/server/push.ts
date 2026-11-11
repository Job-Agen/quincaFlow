import { getSql, rows } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest } from '../lib/http';
import { str } from '../lib/validate';
import { etatCharge, phraseEcheance, type ChargeRow } from '../domain/charge';
import { money } from '../utils/format';
import type { Session } from '@/types';

/**
 * Les rappels d'échéance envoyés au navigateur (§68).
 *
 * Trois pièces, et chacune peut manquer sans faire tomber le reste :
 * l'abonnement — un navigateur sur un appareil —, l'envoi — signé avec les
 * clés VAPID —, et le travail quotidien qui décide quoi envoyer.
 *
 * Sans clés configurées, tout se tait **proprement** et le dit : la
 * fonctionnalité s'annonce indisponible au lieu d'échouer sur un refus
 * illisible, comme l'envoi de courriel du §57.
 */

export interface ClesVapid {
  publique: string;
  privee: string;
  contact: string;
}

/** Les clés, ou `null` si l'hébergeur n'en a pas. */
export function clesVapid(): ClesVapid | null {
  const publique = process.env.VAPID_PUBLIC_KEY || '';
  const privee = process.env.VAPID_PRIVATE_KEY || '';
  if (!publique || !privee) return null;
  return {
    publique,
    privee,
    // Le protocole veut un contact joignable ; à défaut, une adresse de la
    // boutique importerait peu — c'est le service de distribution qui le lit.
    contact: process.env.VAPID_SUBJECT || 'mailto:contact@maquincaillerie.app',
  };
}

export async function saveSubscription(session: Session, body: Record<string, unknown>) {
  const abonnement = (body.subscription || body) as Record<string, unknown>;
  const cles = (abonnement.keys || {}) as Record<string, unknown>;
  const endpoint = str(abonnement.endpoint, 'adresse de notification', { max: 1000 });
  const p256dh = str(cles.p256dh, 'clé du navigateur', { max: 400 });
  const auth = str(cles.auth, 'secret du navigateur', { max: 400 });

  // Le même navigateur réabonné garde une seule ligne : son adresse est sa
  // clé. Sans cela, un gérant qui réautorise trois fois recevrait trois
  // notifications identiques.
  await getSql()`
    INSERT INTO push_subscriptions (id, business_id, user_id, endpoint, p256dh, auth)
    VALUES (${newId('sub')}, ${session.businessId}, ${session.userId},
            ${endpoint}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint) DO UPDATE
       SET business_id = EXCLUDED.business_id, user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
  return { abonne: true };
}

export async function removeSubscription(session: Session, body: Record<string, unknown>) {
  const endpoint = str(body.endpoint, 'adresse de notification', { max: 1000 });
  await getSql()`
    DELETE FROM push_subscriptions
     WHERE endpoint = ${endpoint} AND business_id = ${session.businessId}
  `;
  return { abonne: false };
}

interface Abonnement {
  id: string;
  business_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Envoie un avis à tous les appareils d'une boutique.
 *
 * Un abonnement que le navigateur a oublié répond 404 ou 410 : il est retiré
 * plutôt que réessayé chaque jour jusqu'à la fin des temps. Les autres échecs
 * sont comptés et rendus — le travail quotidien les journalise, il ne les
 * cache pas.
 */
async function envoyer(
  abonnements: Abonnement[],
  avis: { title: string; body: string; url?: string; tag?: string }
): Promise<{ envoyes: number; retires: number; echecs: number }> {
  const cles = clesVapid();
  if (!cles) throw badRequest('Notifications non configurées sur ce serveur.');

  // Chargé à la demande : la bibliothèque ne sert qu'ici, et une vente au
  // comptoir n'a pas à la payer en temps de démarrage.
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(cles.contact, cles.publique, cles.privee);

  const charge = JSON.stringify(avis);
  let envoyes = 0;
  let echecs = 0;
  const perimes: string[] = [];

  await Promise.all(
    abonnements.map(async (abonnement) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: abonnement.endpoint,
            keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
          },
          charge
        );
        envoyes += 1;
      } catch (souci) {
        const code = (souci as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) perimes.push(abonnement.endpoint);
        else echecs += 1;
      }
    })
  );

  if (perimes.length > 0) {
    await getSql()`DELETE FROM push_subscriptions WHERE endpoint = ANY(${perimes}::text[])`;
  }
  return { envoyes, retires: perimes.length, echecs };
}

/** Les charges échues ou dues aujourd'hui, par boutique. */
export async function chargesARappeler(aujourdhui: string): Promise<Map<string, ChargeRow[]>> {
  const dues = rows<ChargeRow>(
    await getSql()`
      SELECT id, business_id, category, label, amount::float8 AS amount, interval_months,
             next_due_on::text AS next_due_on, last_paid_on::text AS last_paid_on,
             active, note, created_at, updated_at
        FROM recurring_charges
       WHERE active AND next_due_on <= ${aujourdhui}::date
       ORDER BY business_id, next_due_on
    `
  );
  const parBoutique = new Map<string, ChargeRow[]>();
  for (const charge of dues) {
    const liste = parBoutique.get(charge.business_id) || [];
    liste.push(charge);
    parBoutique.set(charge.business_id, liste);
  }
  return parBoutique;
}

/**
 * La phrase du rappel.
 *
 * Une seule charge : on la nomme, c'est ce qui fait agir. Plusieurs : on
 * compte, parce qu'une notification tronquée au milieu d'une liste ne dit
 * rien. Le montant total vient en second — il dit s'il faut passer à la
 * banque avant d'ouvrir.
 */
export function phraseRappel(
  charges: ChargeRow[],
  aujourdhui: string,
  devise: string
): { title: string; body: string } {
  const total = charges.reduce((somme, charge) => somme + Number(charge.amount || 0), 0);
  const enRetard = charges.filter(
    (charge) => etatCharge(charge.next_due_on, aujourdhui) === 'en-retard'
  ).length;

  if (charges.length === 1) {
    const seule = charges[0]!;
    return {
      title: `${seule.label} — ${money(seule.amount, devise)}`,
      body: phraseEcheance(seule.next_due_on, aujourdhui),
    };
  }
  return {
    title: `${charges.length} charges à payer — ${money(total, devise)}`,
    body: enRetard > 0 ? `Dont ${enRetard} en retard.` : 'Échues aujourd’hui.',
  };
}

/**
 * Le travail quotidien : prévenir chaque boutique de ce qu'elle doit payer.
 *
 * Rendu plutôt que journalisé en silence : la route qui l'appelle renvoie le
 * compte, et un rappel qui n'est jamais parti se voit dans la réponse du
 * déclencheur au lieu de se deviner.
 */
export async function envoyerRappelsDuJour(aujourdhui: string) {
  const parBoutique = await chargesARappeler(aujourdhui);
  if (parBoutique.size === 0) return { boutiques: 0, envoyes: 0, retires: 0, echecs: 0 };

  const abonnements = rows<Abonnement & { currency: string }>(
    await getSql()`
      SELECT s.id, s.business_id, s.endpoint, s.p256dh, s.auth,
             COALESCE(b.currency, 'FCFA') AS currency
        FROM push_subscriptions s
        JOIN businesses b ON b.id = s.business_id
       WHERE s.business_id = ANY(${[...parBoutique.keys()]}::text[])
    `
  );

  const bilan = { boutiques: 0, envoyes: 0, retires: 0, echecs: 0 };
  for (const [businessId, charges] of parBoutique) {
    const cibles = abonnements.filter((abonnement) => abonnement.business_id === businessId);
    if (cibles.length === 0) continue;
    const avis = phraseRappel(charges, aujourdhui, cibles[0]!.currency);
    const resultat = await envoyer(cibles, { ...avis, url: '/charges', tag: 'charges' });
    bilan.boutiques += 1;
    bilan.envoyes += resultat.envoyes;
    bilan.retires += resultat.retires;
    bilan.echecs += resultat.echecs;
  }
  return bilan;
}
