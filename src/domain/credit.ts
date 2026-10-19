import { round2, toNumber } from '../utils/money';
import { money } from '../utils/format';
import type { Money } from '@/types';

/**
 * Carnet de crédit (§45).
 *
 * Dans une quincaillerie de Lomé, la dette n'est pas une option du logiciel :
 * c'est le quotidien. Le maçon prend ses sacs le lundi et paie le vendredi,
 * quand son client à lui l'a payé. Jusqu'ici l'application savait enregistrer
 * une vente à moitié payée, mais plus rien ensuite : la dette restait ouverte
 * pour toujours, et le gérant tenait son vrai carnet sur un cahier.
 *
 * Ce module tient les règles de ce carnet. Elles sont pures et partagées par le
 * serveur, le web et l'Android — un remboursement doit s'imputer de la même
 * façon partout, sans quoi deux écrans donneraient deux soldes.
 */

/** L'instant d'une date, qu'elle vienne en chaîne ISO ou en `Date`. */
function instant(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Ce qu'une vente doit encore, jamais négatif. */
export function saleBalance(total: unknown, amountPaid: unknown): Money {
  return round2(Math.max(0, toNumber(total) - toNumber(amountPaid)));
}

/** Une vente telle que l'imputation la regarde : son dû, et rien d'autre. */
export interface OpenSale {
  readonly id: string;
  readonly reference: string;
  readonly total: number;
  readonly amount_paid: number;
  /**
   * Date de la vente, telle que le pilote la rend.
   *
   * Les deux formes existent réellement : le pilote HTTP de Neon rend une
   * chaîne ISO, `pg` rend un `Date`. Les comparer comme des chaînes a planté
   * en local au premier remboursement — `localeCompare` n'existe pas sur un
   * `Date`. L'ordre se prend donc sur l'instant, qui est défini pour les deux.
   */
  readonly created_at: string | Date;
}

/** Part d'un remboursement imputée à une vente. */
export interface Allocation {
  readonly saleId: string;
  readonly reference: string;
  readonly amount: Money;
  /** Le nouveau montant encaissé de la vente, après imputation. */
  readonly amountPaid: Money;
}

/**
 * Impute un remboursement aux ventes impayées, de la plus ancienne à la plus
 * récente.
 *
 * C'est la règle du cahier : on solde d'abord la vieille ardoise. Elle n'est
 * pas arbitraire — c'est celle que le gérant applique de tête, et celle qui
 * fait qu'un client ne traîne pas indéfiniment une dette de l'an dernier
 * derrière des achats récents.
 *
 * Le montant est imputé jusqu'à épuisement. Rien n'est rendu en trop : la
 * somme des parts vaut exactement le montant versé, et le solde ne peut pas
 * devenir négatif. Un versement supérieur à la dette est refusé en amont
 * (`tooMuch`) plutôt que transformé en avoir — une avance client est un autre
 * sujet, que le §45 ne traite pas.
 */
export function allocateRepayment(amount: unknown, openSales: readonly OpenSale[]): Allocation[] {
  let left = round2(amount);
  const parts: Allocation[] = [];

  for (const sale of [...openSales].sort((a, b) => instant(a.created_at) - instant(b.created_at))) {
    if (left <= 0) break;
    const due = saleBalance(sale.total, sale.amount_paid);
    if (due <= 0) continue;
    const part = round2(Math.min(due, left));
    parts.push({
      saleId: sale.id,
      reference: sale.reference,
      amount: part,
      amountPaid: round2(toNumber(sale.amount_paid) + part),
    });
    left = round2(left - part);
  }

  return parts;
}

/** Dette totale portée par un ensemble de ventes. */
export function totalOwed(openSales: readonly OpenSale[]): Money {
  return round2(
    openSales.reduce((somme, vente) => somme + saleBalance(vente.total, vente.amount_paid), 0)
  );
}

/**
 * Vrai si le versement dépasse ce qui est dû.
 *
 * Les deux montants sont ramenés au centime avant d'être comparés : un écart
 * plus fin — celui qu'une division par un conditionnement laisse traîner — a
 * déjà disparu à l'arrondi, et ne peut donc pas faire refuser un solde payé au
 * franc près. Une tolérance explicite en plus de cet arrondi serait du code
 * mort : deux multiples du centime ne diffèrent jamais de moins d'un centime.
 */
export function tooMuch(amount: unknown, owed: unknown): boolean {
  return round2(amount) > round2(owed);
}

/** Un débiteur, tel que le classement le présente. */
export interface Debtor {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly owed: number;
  /** Jours écoulés depuis la plus ancienne vente impayée, ou null. */
  readonly oldestDays: number | null;
}

/** Un débiteur classé, avec sa part de la dette totale. */
export interface RankedDebtor extends Debtor {
  readonly share: number;
}

/**
 * Classement des principaux débiteurs, du plus gros au plus petit.
 *
 * `share` est la part de la dette *affichée*, non de la dette totale de la
 * boutique : la barre la plus longue vaut 100 %, et les autres se lisent par
 * rapport à elle. Un graphique où la plus grande barre n'atteindrait jamais le
 * bord ne se lirait pas mieux, et ferait croire à une réserve qui n'existe pas.
 */
export function rankDebtors(debtors: readonly Debtor[], limit = 5): RankedDebtor[] {
  const retenus = [...debtors]
    .filter((debiteur) => debiteur.owed > 0)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'fr'))
    .slice(0, Math.max(0, limit));
  const sommet = retenus[0]?.owed ?? 0;
  return retenus.map((debiteur) => ({
    ...debiteur,
    share: sommet > 0 ? debiteur.owed / sommet : 0,
  }));
}

/**
 * Numéro de téléphone au format international, sans « + » ni séparateur.
 *
 * C'est ce que `wa.me` attend. Les numéros sont saisis comme on les dicte —
 * « 90 00 00 00 », « +228 90-00-00-00 », « 00228 90000000 » — et les trois
 * doivent mener à la même conversation.
 *
 * L'indicatif par défaut est celui de la boutique : à huit chiffres, un numéro
 * togolais est complet pour celui qui le compose sur place, et incomplet pour
 * WhatsApp. Rendre `null` plutôt que de deviner sur un numéro trop court évite
 * d'ouvrir une conversation avec un inconnu.
 */
export function whatsappNumber(phone: unknown, defaultCode = '228'): string | null {
  const brut = String(phone ?? '').trim();
  if (!brut) return null;

  const chiffres = brut.replace(/[^\d+]/g, '');
  const international = chiffres.startsWith('+')
    ? chiffres.slice(1)
    : chiffres.startsWith('00')
      ? chiffres.slice(2)
      : null;

  const numero = international ?? `${defaultCode}${chiffres}`;
  // Huit chiffres au Togo, onze avec l'indicatif ; le plus court numéro
  // international utile en fait sept. En deçà, ce n'est pas un numéro.
  return /^\d{9,15}$/.test(numero) ? numero : null;
}

/** Lien `wa.me` ouvrant la conversation, message pré-rempli. */
export function whatsappLink(phone: unknown, message: string, defaultCode = '228'): string | null {
  const numero = whatsappNumber(phone, defaultCode);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}` : null;
}

/** Ce qu'il faut savoir pour écrire la relance. */
export interface ReminderInput {
  readonly customerName: string;
  readonly businessName: string;
  readonly owed: number;
  readonly currency?: string;
  /** Nombre de ventes impayées, pour dire « vos 3 achats » plutôt que « votre achat ». */
  readonly openCount?: number;
}

/**
 * Message de relance, poli et vérifiable.
 *
 * Trois exigences, et elles tirent dans le même sens. Il doit être **poli** :
 * le débiteur est un client qu'on veut garder, souvent un voisin. Il doit être
 * **vérifiable** : un montant et un nombre d'achats, pour que le client puisse
 * confronter au sien. Et il doit laisser une **porte ouverte** : qui ne peut
 * pas tout payer aujourd'hui doit pouvoir le dire plutôt que se taire.
 *
 * Il n'y a pas de menace, pas de date butoir, pas de majuscules. Un gérant qui
 * voudrait être sec l'écrira lui-même : WhatsApp s'ouvre sur un brouillon
 * modifiable, jamais sur un envoi.
 */
export function reminderMessage({
  customerName,
  businessName,
  owed,
  currency = 'FCFA',
  openCount = 0,
}: ReminderInput): string {
  const achats = openCount > 1 ? `vos ${openCount} achats non soldés` : 'votre achat non soldé';
  return [
    `Bonjour ${customerName},`,
    '',
    `C'est ${businessName}. Pour ${achats}, il reste ${money(owed, currency)} à régler.`,
    '',
    'Merci de passer quand cela vous arrange, ou dites-moi ce qui vous convient ; un règlement en plusieurs fois est possible.',
    '',
    'Bonne journée.',
  ].join('\n');
}
