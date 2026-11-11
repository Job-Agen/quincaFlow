import type { ExpenseCategory } from '@/types';

/**
 * Les charges qui reviennent (§66).
 *
 * Le loyer, les salaires, la facture d'électricité : une quincaillerie les
 * paie depuis toujours, et l'application les enregistrait déjà comme dépenses
 * (§39). Ce qui manquait, c'est l'échéance — le fait qu'après avoir payé, il
 * faudra repayer, et que l'oubli coûte cher.
 *
 * Ce module ne tient que le calendrier. Le paiement, lui, reste une dépense
 * ordinaire : c'est elle qui entre dans les rapports et dans la caisse, et il
 * n'y a pas deux façons de sortir de l'argent.
 */

export type PeriodeCharge = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

export const PERIODES: Record<PeriodeCharge, { label: string; mois: number; jours: number }> = {
  WEEKLY: { label: 'Chaque semaine', mois: 0, jours: 7 },
  MONTHLY: { label: 'Chaque mois', mois: 1, jours: 0 },
  QUARTERLY: { label: 'Tous les 3 mois', mois: 3, jours: 0 },
  HALF_YEARLY: { label: 'Tous les 6 mois', mois: 6, jours: 0 },
  YEARLY: { label: 'Chaque année', mois: 12, jours: 0 },
};

export const PERIODES_ORDRE: readonly PeriodeCharge[] = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'WEEKLY',
];

/** Une date `YYYY-MM-DD` telle que la base la range, sans fuseau. */
const enJour = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

/** Lit `YYYY-MM-DD` en date locale, à midi — hors de portée des décalages. */
function lire(jour: string): Date {
  const [annee, mois, date] = jour.slice(0, 10).split('-').map(Number);
  return new Date(annee ?? 1970, (mois ?? 1) - 1, date ?? 1, 12, 0, 0, 0);
}

/**
 * L'échéance suivante, comptée **depuis le paiement**.
 *
 * C'est le modèle du chrono, pas celui du calendrier : payer le 11 reporte au
 * 11 du mois suivant, et non au 1er. Le gérant qui paie ses employés avec
 * trois jours de retard ne veut pas être rappelé trois jours après — il veut
 * un mois de tranquillité.
 *
 * Le 31 pose la seule vraie question : un mois après le 31 janvier n'existe
 * pas. La date est alors ramenée au dernier jour du mois atteint — 28 ou 29
 * février — plutôt que de déborder sur mars, ce que ferait l'arithmétique
 * naïve de JavaScript.
 */
export function prochaineEcheance(depuis: string, periode: PeriodeCharge): string {
  const { mois, jours } = PERIODES[periode];
  const base = lire(depuis);

  if (jours > 0) {
    base.setDate(base.getDate() + jours);
    return enJour(base);
  }

  const jourVoulu = base.getDate();
  // Le 1er du mois d'arrivée, d'où l'on ne peut pas déborder.
  const cible = new Date(base.getFullYear(), base.getMonth() + mois, 1, 12, 0, 0, 0);
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0, 12).getDate();
  cible.setDate(Math.min(jourVoulu, dernierJour));
  return enJour(cible);
}

/** Jours restants avant l'échéance : négatif si elle est passée. */
export function joursAvant(echeance: string, aujourdhui: string): number {
  const un = 24 * 60 * 60 * 1000;
  return Math.round((lire(echeance).getTime() - lire(aujourdhui).getTime()) / un);
}

export type EtatCharge = 'en-retard' | 'bientot' | 'plus-tard';

/** Fenêtre d'avertissement : une semaine suffit pour réunir la somme. */
export const JOURS_AVERTISSEMENT = 7;

export function etatCharge(echeance: string, aujourdhui: string): EtatCharge {
  const jours = joursAvant(echeance, aujourdhui);
  if (jours < 0) return 'en-retard';
  return jours <= JOURS_AVERTISSEMENT ? 'bientot' : 'plus-tard';
}

/**
 * Ce que l'écran dit de l'échéance.
 *
 * Une date seule — « 11/12/2026 » — oblige le gérant à compter. La phrase
 * compte pour lui, et le retard se dit en premier parce que c'est lui qui
 * coûte.
 */
export function phraseEcheance(echeance: string, aujourdhui: string): string {
  const jours = joursAvant(echeance, aujourdhui);
  if (jours < -1) return `En retard de ${-jours} jours`;
  if (jours === -1) return 'En retard depuis hier';
  if (jours === 0) return 'À payer aujourd’hui';
  if (jours === 1) return 'À payer demain';
  if (jours <= JOURS_AVERTISSEMENT) return `Dans ${jours} jours`;
  return `Dans ${jours} jours`;
}

export interface ChargeRow {
  id: string;
  business_id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  periode: PeriodeCharge;
  /** `YYYY-MM-DD` : le jour où il faudra repayer. */
  next_due_on: string;
  last_paid_on: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}
