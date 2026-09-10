/**
 * Arithmétique des montants.
 *
 * Le FCFA s'affiche sans décimale, mais les calculs intermédiaires en produisent :
 * un carton de 40 pièces payé 12 750 revient à 318,75 la pièce. Tout est donc
 * calculé en nombres à virgule puis arrondi au dernier moment, à la précision de
 * la colonne visée — 2 décimales pour un montant, 3 pour une quantité.
 */

/** Convertit en nombre fini, ou renvoie 0. Absorbe les chaînes des formulaires. */
export function toNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(',', '.').replace(/\s/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Arrondi monétaire (2 décimales). */
export function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

/** Arrondi d'une quantité (3 décimales, comme numeric(14,3)). */
export function round3(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 1000) / 1000;
}
