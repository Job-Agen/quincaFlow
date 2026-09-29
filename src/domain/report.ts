import { round2, toNumber } from '../utils/money';
import type { ExpenseCategory, Granularity, Money, PeriodTotals } from '@/types';

/**
 * Calculs des rapports financiers (§39).
 *
 * Fonctions pures, partagées par la couche serveur qui agrège et par les écrans
 * qui recomposent un total après un filtre. Le point de toute la section tient
 * en deux lignes plus bas : la marge brute ne déduit que les marchandises, le
 * bénéfice net déduit aussi les dépenses. Les confondre revient à annoncer au
 * commerçant un gain qu'il a déjà dépensé en loyer.
 */

/** Les six postes du §40, dans l'ordre où le PRD les donne. */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'RENT',
  'UTILITIES',
  'SALARY',
  'STOCK_PURCHASE',
  'TRANSPORT',
  'OTHER',
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: 'Loyer de boutique',
  UTILITIES: 'Énergie et eau',
  SALARY: 'Salaires des commis',
  STOCK_PURCHASE: 'Achat de stock',
  TRANSPORT: 'Transport',
  OTHER: 'Divers',
};

/**
 * Postes qui ne sont *pas* des charges de la période (§39, §40).
 *
 * L'achat de stock sort bien de la caisse, mais la marchandise est déjà comptée
 * au moment où elle est vendue — c'est le coût des marchandises vendues (§13).
 * La déduire une seconde fois ferait payer deux fois le même sac de ciment, et
 * un mois de réassort afficherait une perte imaginaire.
 *
 * L'ensemble est nommé plutôt qu'écrit en dur dans une requête : c'est une règle
 * comptable, elle doit se lire à un seul endroit.
 */
export const NON_OPERATING_CATEGORIES: readonly ExpenseCategory[] = ['STOCK_PURCHASE'];

/** Vrai si le poste se déduit du bénéfice net. */
export function isOperating(category: ExpenseCategory): boolean {
  return !NON_OPERATING_CATEGORIES.includes(category);
}

/**
 * Bénéfice net = marge brute − dépenses.
 *
 * Il peut être négatif, et l'écran doit le montrer tel quel : un mois où le
 * loyer dépasse la marge est précisément ce que le gérant a besoin de voir.
 */
export function netProfit(grossMargin: unknown, expenses: unknown): Money {
  return round2(toNumber(grossMargin) - toNumber(expenses));
}

/**
 * Taux de marge, en pourcentage.
 *
 * Sans chiffre d'affaires il n'y a pas de taux — `null`, et non zéro : un taux
 * de 0 % se lirait comme « vendu sans marge », alors que rien n'a été vendu.
 */
export function marginRate(margin: unknown, revenue: unknown): number | null {
  const base = toNumber(revenue);
  if (base <= 0) return null;
  return Math.round((toNumber(margin) / base) * 1000) / 10;
}

/**
 * Recompose un résultat de période à partir de ses agrégats.
 *
 * Le coût des ventes hors stock se déduit de leur marge, déjà figée à
 * l'enregistrement (§16) : la recalculer depuis le prix d'achat du jour ferait
 * bouger le passé.
 */
export function periodTotals(parts: {
  salesRevenue: unknown;
  salesCost: unknown;
  outOfStockRevenue: unknown;
  outOfStockMargin: unknown;
  /** Toutes les dépenses de la période : ce qui est sorti de la caisse (§40). */
  expenses: unknown;
  /** La part qui n'est pas une charge — l'achat de stock, déjà compté au coût. */
  stockPurchases?: unknown;
}): PeriodTotals {
  const salesRevenue = round2(parts.salesRevenue);
  const salesCost = round2(parts.salesCost);
  const outOfStockRevenue = round2(parts.outOfStockRevenue);
  const outOfStockMargin = round2(parts.outOfStockMargin);
  const expenses = round2(parts.expenses);
  const stockPurchases = round2(parts.stockPurchases);
  const operatingExpenses = round2(expenses - stockPurchases);

  const revenue = round2(salesRevenue + outOfStockRevenue);
  const costOfGoods = round2(salesCost + (outOfStockRevenue - outOfStockMargin));
  const grossMargin = round2(revenue - costOfGoods);

  return {
    revenue,
    salesRevenue,
    outOfStockRevenue,
    costOfGoods,
    grossMargin,
    marginRate: marginRate(grossMargin, revenue),
    expenses,
    stockPurchases,
    operatingExpenses,
    netProfit: netProfit(grossMargin, operatingExpenses),
  };
}

/** Jusqu'à trois mois, le jour ; au-delà il faudrait faire défiler un an de lignes. */
const DAILY_SPAN_DAYS = 92;

/**
 * Découpage du rapport des ventes : par jour sur une période courte, par mois
 * au-delà (§39).
 *
 * Sans borne de début — « Tout » —, c'est nécessairement le mois : une boutique
 * ouverte depuis deux ans produirait sept cents lignes à faire défiler.
 */
export function granularityOf(from?: string | null, to?: string | null): Granularity {
  if (!from) return 'month';
  const end = to ? new Date(to).getTime() : Date.now();
  const days = (end - new Date(from).getTime()) / 86400000;
  return days <= DAILY_SPAN_DAYS ? 'day' : 'month';
}

/**
 * Part d'une ligne de vente après répartition de la remise (§39).
 *
 * La remise est accordée sur la vente entière. L'imputer à une seule ligne
 * fausserait la rentabilité de ce produit ; l'ignorer ferait que la somme des
 * produits dépasse le chiffre d'affaires réellement encaissé. Le prorata du
 * montant de ligne est le seul partage qui conserve les deux.
 */
export function discountedShare(lineTotal: unknown, subtotal: unknown, total: unknown): Money {
  const base = toNumber(subtotal);
  if (base <= 0) return 0;
  return round2(toNumber(lineTotal) * (toNumber(total) / base));
}
