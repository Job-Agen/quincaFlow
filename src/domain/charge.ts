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

/**
 * La périodicité est **un nombre de mois**, et rien d'autre (§67).
 *
 * Une liste de périodes nommées — mensuel, trimestriel, semestriel, annuel —
 * oblige le gérant à ranger sa charge dans une case que quelqu'un d'autre a
 * dessinée. Un bail payé tous les deux mois n'y entrait pas. « Tous les N
 * mois » les contient toutes, et se lit sans apprendre de vocabulaire.
 */
export const MOIS_MIN = 1;
export const MOIS_MAX = 60;

/** « Chaque mois », « Tous les 3 mois » : la phrase, pas le nombre nu. */
export function phrasePeriode(mois: number): string {
  if (mois <= 1) return 'Chaque mois';
  if (mois === 12) return 'Chaque année';
  return `Tous les ${mois} mois`;
}

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
export function prochaineEcheance(depuis: string, mois: number): string {
  const base = lire(depuis);
  const jourVoulu = base.getDate();
  // Le 1er du mois d'arrivée, d'où l'on ne peut pas déborder.
  const cible = new Date(
    base.getFullYear(),
    base.getMonth() + Math.max(MOIS_MIN, Math.round(mois)),
    1,
    12,
    0,
    0,
    0
  );
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0, 12).getDate();
  cible.setDate(Math.min(jourVoulu, dernierJour));
  return enJour(cible);
}

/** Jours restants avant l'échéance : négatif si elle est passée. */
export function joursAvant(echeance: string, aujourdhui: string): number {
  const un = 24 * 60 * 60 * 1000;
  return Math.round((lire(echeance).getTime() - lire(aujourdhui).getTime()) / un);
}

/**
 * L'échéance précédente : `prochaineEcheance` à l'envers.
 *
 * Elle ne sert qu'à retrouver le début d'une période quand la date du dernier
 * paiement manque — une charge importée, une ligne réparée à la main. Le
 * serveur pose toujours `last_paid_on`, et c'est cette date-là qui fait foi :
 * celle-ci n'est qu'un filet.
 */
export function echeancePrecedente(echeance: string, mois: number): string {
  const base = lire(echeance);
  const jourVoulu = base.getDate();
  const cible = new Date(
    base.getFullYear(),
    base.getMonth() - Math.max(MOIS_MIN, Math.round(mois)),
    1,
    12,
    0,
    0,
    0
  );
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0, 12).getDate();
  cible.setDate(Math.min(jourVoulu, dernierJour));
  return enJour(cible);
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

/**
 * Le décompte d'une charge (§70).
 *
 * Le gérant ne veut pas lire une date, il veut voir fondre un délai : 30, 29,
 * 28… Ce que ce module rend, c'est de quoi dessiner ce chrono — combien de
 * jours restent, sur combien, et quelle part du répit est déjà consommée.
 *
 * `part` est la part **écoulée**, de 0 à 1 : l'anneau de l'écran montre ce
 * qu'il en reste, donc `1 − part`, et se vide à mesure que l'échéance
 * approche. En retard, il ne reste rien : la part est pleine, et le nombre
 * compte alors les jours de retard.
 */
/**
 * Le mot qui doit apparaître à côté du chrono, s'il y en a un (§70).
 *
 * Le nombre de l'anneau dit déjà combien de jours : répéter « Dans 6 jours »
 * à côté d'un « 6 j » ne dit rien de plus, et prend la place du nom de la
 * charge. Seuls deux cas méritent des mots, parce que le nombre seul s'y
 * lirait de travers : le retard — où le chrono compte à l'envers — et le jour
 * même, où il ne reste plus rien à attendre.
 */
export function alerteEcheance(echeance: string, aujourdhui: string): string | null {
  const jours = joursAvant(echeance, aujourdhui);
  if (jours < 0) return 'En retard';
  if (jours === 0) return 'Aujourd’hui';
  return null;
}

export interface Decompte {
  /** Jours restants ; négatif quand l'échéance est passée. */
  jours: number;
  /** Durée de la période, en jours — 28, 30 ou 31 selon les mois. */
  total: number;
  /** Jours déjà écoulés depuis le dernier paiement. */
  ecoules: number;
  /** Part écoulée, de 0 à 1. */
  part: number;
  etat: EtatCharge;
}

export function decompte(
  charge: {
    next_due_on: string;
    last_paid_on?: string | null;
    interval_months: number;
  },
  aujourdhui: string
): Decompte {
  const debut =
    charge.last_paid_on || echeancePrecedente(charge.next_due_on, charge.interval_months);
  // Une période d'au moins un jour : payer et redevoir le même jour donnerait
  // sinon une division par zéro, et un anneau indessinable.
  const total = Math.max(1, joursAvant(charge.next_due_on, debut));
  const jours = joursAvant(charge.next_due_on, aujourdhui);
  const ecoules = Math.min(total, Math.max(0, total - jours));
  return { jours, total, ecoules, part: ecoules / total, etat: etatCharge(charge.next_due_on, aujourdhui) };
}

export interface ChargeRow {
  id: string;
  business_id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  /** Tous les combien de mois elle revient (§67). */
  interval_months: number;
  /** `YYYY-MM-DD` : le jour où il faudra repayer. */
  next_due_on: string;
  last_paid_on: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}
