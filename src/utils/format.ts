/** Mises en forme partagées par tous les écrans. */

/** Ce dont `new Date()` sait partir : une chaîne ISO, un horodatage, une date. */
type DateLike = string | number | Date;

/** « 19 250 FCFA ». L'espace insécable évite un retour à la ligne avant la devise. */
export function money(value: unknown, currency = 'FCFA'): string {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
}

/** Montant seul, sans devise — pour les tableaux où la devise est en en-tête. */
export function amount(value: unknown): string {
  const parsed = Number(value);
  return (Number.isFinite(parsed) ? parsed : 0).toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
  });
}

/** Quantité : entière quand elle l'est, sinon jusqu'à trois décimales. */
export function quantity(value: unknown): string {
  const parsed = Number(value) || 0;
  return parsed.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

/**
 * Unités de mesure invariables au pluriel.
 *
 * Les symboles normalisés ne prennent pas la marque du pluriel : on écrit
 * « 50 kg », jamais « 50 kgs ». Les noms communs, eux, s'accordent — « 3 sacs »,
 * « 12 pièces » —, et une liste de produits qui affiche « 12 pièce » se lit
 * comme un bogue.
 */
const INVARIABLE_UNITS = new Set([
  'kg',
  'g',
  'mg',
  't',
  'l',
  'ml',
  'cl',
  'dl',
  'm',
  'cm',
  'mm',
  'km',
  'm2',
  'm3',
  'm²',
  'm³',
]);

/** « 3 sacs », « 1 pièce », « 50 kg » : quantité suivie de son unité accordée. */
export function withUnit(value: unknown, unit: string | null | undefined): string {
  const label = String(unit || '').trim();
  if (!label) return quantity(value);
  const count = Number(value) || 0;
  const invariable =
    INVARIABLE_UNITS.has(label.toLowerCase()) || /[sxz]$/i.test(label) || /\s/.test(label);
  return `${quantity(value)} ${Math.abs(count) >= 2 && !invariable ? `${label}s` : label}`;
}

export function shortDate(value: DateLike): string {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function time(value: DateLike): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(value: DateLike): string {
  return `${shortDate(value)} · ${time(value)}`;
}

/** « septembre 2026 » — en-tête d'une tranche mensuelle de rapport (§39). */
export function monthLabel(value: DateLike): string {
  return new Date(value).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/**
 * « 24 % », ou « — » quand le taux n'existe pas.
 *
 * Un taux absent n'est pas un taux nul : rien n'a été vendu, et afficher 0 %
 * se lirait comme une vente faite sans marge (§39).
 */
export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** « aujourd'hui » / « hier » / date — utilisé pour grouper l'historique. */
export function dayLabel(value: DateLike): string {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return shortDate(value);
}
