'use client';

import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/domain/report';
import { amount, money, percent } from '@/utils/format';
import type { ExpenseBucket, ExpenseCategory } from '@/types';

/**
 * Répartition des dépenses en anneau (§40, F16).
 *
 * Il répond à une question qu'une colonne de chiffres pose mal : lequel de mes
 * postes me mange ? C'est le seul graphique de l'application — le §8 les interdit
 * sur le tableau de bord, et celui-ci n'y figure pas.
 *
 * Quatre partis pris :
 *
 * — **Aucune bibliothèque.** Un anneau, c'est six arcs : importer trois cents
 *   kilooctets de JavaScript pour les tracer se paierait à chaque ouverture, sur
 *   précisément le genre de connexion que QuincaFlow doit ménager (§35).
 * — **La couleur ne dit rien seule.** Chaque part est nommée et chiffrée dans la
 *   légende, dans le même ordre. Trois des six teintes n'atteignent pas 3:1 de
 *   contraste sur fond blanc : la légende n'est pas un complément, c'est ce qui
 *   rend le graphique lisible.
 * — **Un poste, une teinte, pour toujours.** La couleur suit le poste et non son
 *   rang : un mois sans loyer ne doit pas repeindre les autres parts.
 * — **Une fente de 2 px entre les parts**, sinon deux teintes voisines se
 *   touchent et l'œil lit une seule part plus large.
 */

/** Rayon de la ligne médiane de l'anneau, dans le repère du SVG. */
const RADIUS = 62;
const THICKNESS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Fente entre deux parts, en unités du SVG — soit environ 2 px à l'écran. */
const GAP = 2;

/**
 * Teinte de chaque poste, fixée par son rang dans `EXPENSE_CATEGORIES`.
 *
 * Les six pas viennent d'une palette catégorielle validée : pire paire voisine
 * ΔE 9.1 en vision des couleurs déficiente, 19.6 en vision normale — au-dessus
 * des seuils de 8 et 15. Les changer demande de revalider l'ensemble, pas
 * seulement la teinte remplacée.
 */
export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  RENT: '#2a78d6',
  UTILITIES: '#eb6834',
  SALARY: '#1baf7a',
  STOCK_PURCHASE: '#eda100',
  TRANSPORT: '#e87ba4',
  OTHER: '#008300',
};

interface Slice {
  category: ExpenseCategory;
  amount: number;
  share: number;
  offset: number;
}

/**
 * Découpe les postes en parts d'anneau.
 *
 * L'ordre est celui de `EXPENSE_CATEGORIES`, non celui des montants : c'est ce
 * qui garantit qu'un poste garde sa teinte d'un mois sur l'autre. Les postes à
 * zéro sont écartés — une part invisible occuperait une entrée de légende.
 */
function slicesOf(buckets: ExpenseBucket[], total: number): Slice[] {
  const byCategory = new Map(buckets.map((bucket) => [bucket.category, bucket.amount]));
  let cursor = 0;
  return EXPENSE_CATEGORIES.flatMap((category) => {
    const amount = byCategory.get(category) ?? 0;
    if (amount <= 0) return [];
    const share = total > 0 ? amount / total : 0;
    const slice: Slice = { category, amount, share, offset: cursor };
    cursor += share;
    return [slice];
  });
}

export default function ExpenseDonut({
  buckets,
  total,
  currency,
}: {
  buckets: ExpenseBucket[];
  total: number;
  currency: string;
}) {
  const slices = slicesOf(buckets, total);
  if (slices.length === 0 || total <= 0) return null;

  /** Part en pourcentage, arrondie au dixième — « 19,2 % », jamais « 19.2 % ». */
  const share = (fraction: number) => percent(Math.round(fraction * 1000) / 10);

  // La description remplace le graphique pour qui ne le voit pas : elle porte les
  // mêmes postes, dans le même ordre, avec leurs parts.
  const description = `Répartition des dépenses : ${slices
    .map(
      (slice) =>
        `${EXPENSE_CATEGORY_LABELS[slice.category]}, ${money(slice.amount, currency)}, ${share(
          slice.share
        )}`
    )
    .join(' ; ')}.`;

  return (
    <div className="donut">
      <svg className="donut__ring" viewBox="0 0 160 160" role="img" aria-label={description}>
        {/* Piste de fond : elle referme l'anneau quand les arrondis laissent un
            filet, et donne sa forme au graphique tant qu'une part est minuscule. */}
        <circle
          cx="80"
          cy="80"
          r={RADIUS}
          fill="none"
          stroke="var(--line)"
          strokeWidth={THICKNESS}
        />
        {slices.map((slice) => {
          const length = slice.share * CIRCUMFERENCE;
          // Une part plus courte que la fente resterait invisible : on lui laisse
          // un filet visible plutôt que de la faire disparaître du graphique.
          const drawn = slices.length === 1 ? length : Math.max(length - GAP, 1.5);
          return (
            <circle
              key={slice.category}
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke={CATEGORY_COLORS[slice.category]}
              strokeWidth={THICKNESS}
              strokeDasharray={`${drawn} ${CIRCUMFERENCE - drawn}`}
              strokeDashoffset={-slice.offset * CIRCUMFERENCE}
              // L'anneau démarre en haut, comme une horloge, et non à 3 heures.
              transform="rotate(-90 80 80)"
            />
          );
        })}
        <text className="donut__total" x="80" y="76" textAnchor="middle">
          {amount(total, 0)}
        </text>
        <text className="donut__unit" x="80" y="94" textAnchor="middle">
          {currency}
        </text>
      </svg>

      <ul className="donut__legend">
        {slices.map((slice) => (
          <li key={slice.category}>
            <span
              className="donut__dot"
              style={{ background: CATEGORY_COLORS[slice.category] }}
              aria-hidden="true"
            />
            <span className="donut__label">{EXPENSE_CATEGORY_LABELS[slice.category]}</span>
            <span className="num donut__amount">{money(slice.amount, currency)}</span>
            <span className="num muted small donut__share">{share(slice.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
