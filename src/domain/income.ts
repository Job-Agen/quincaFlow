import { round2, toNumber } from '../utils/money';
import type { IncomeBucket, IncomeCategory, Money, TakingsDay } from '@/types';

/**
 * Cahier de recettes (§42).
 *
 * Fonctions pures, partagées par le serveur qui agrège et par les écrans — web
 * et natif — qui recomposent un total après un filtre.
 *
 * Tout tient dans une distinction, et c'est elle qui justifie ce module : une
 * recette n'est pas forcément un chiffre d'affaires. Confondre les deux ferait
 * compter deux fois la même vente.
 */

/** Les cinq postes du §42, dans l'ordre où le PRD les donne. */
export const INCOME_CATEGORIES: readonly IncomeCategory[] = [
  'SERVICE',
  'DELIVERY',
  'RENTAL',
  'DEBT_REPAYMENT',
  'OTHER',
];

export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  SERVICE: 'Service rendu',
  DELIVERY: 'Livraison',
  RENTAL: 'Location de matériel',
  DEBT_REPAYMENT: 'Remboursement de dette',
  OTHER: 'Divers',
};

/**
 * Postes qui entrent en caisse sans être du chiffre d'affaires (§42).
 *
 * Quand un client solde une ardoise, l'argent entre aujourd'hui mais la vente a
 * été comptée le jour où elle a eu lieu, à son prix et à son coût d'alors
 * (§13). La recompter à l'encaissement mêlerait les ventes d'un mois au chiffre
 * d'affaires d'un autre, et le gérant croirait avoir vendu deux fois.
 *
 * C'est la symétrique exacte de `NON_OPERATING_CATEGORIES` côté dépenses : là
 * une sortie qui n'est pas une charge, ici une entrée qui n'est pas une recette.
 * Nommer l'ensemble plutôt que l'écrire en dur dans une requête permet de lire
 * la règle à un seul endroit.
 */
export const NON_REVENUE_CATEGORIES: readonly IncomeCategory[] = ['DEBT_REPAYMENT'];

/** Vrai si le poste compte dans le chiffre d'affaires du §39. */
export function isRevenue(category: IncomeCategory): boolean {
  return !NON_REVENUE_CATEGORIES.includes(category);
}

/**
 * La part d'un ensemble de postes qui est du chiffre d'affaires.
 *
 * Sert au §39, qui doit ajouter les services et les locations à la recette sans
 * y ajouter les remboursements.
 */
export function revenueShare(buckets: readonly IncomeBucket[]): Money {
  return round2(
    buckets.reduce(
      (somme, poste) => (isRevenue(poste.category) ? somme + toNumber(poste.amount) : somme),
      0
    )
  );
}

/** Une journée en construction : les deux origines, avant d'être totalisées. */
interface JourBrut {
  salesAmount?: unknown;
  salesCount?: unknown;
  otherAmount?: unknown;
  otherCount?: unknown;
}

/**
 * Assemble les journées du cahier à partir des deux origines.
 *
 * Le serveur agrège séparément les encaissements de vente et les recettes
 * saisies — deux tables, deux requêtes. C'est ici qu'elles se rejoignent, par
 * leur date.
 *
 * Les journées sont rendues de la plus récente à la plus ancienne : un gérant
 * ouvre son cahier pour voir aujourd'hui, pas le premier jour du mois.
 */
export function mergeDays(
  ventes: ReadonlyMap<string, JourBrut> | Readonly<Record<string, JourBrut>>,
  recettes: ReadonlyMap<string, JourBrut> | Readonly<Record<string, JourBrut>>
): TakingsDay[] {
  const lire = (source: typeof ventes): Map<string, JourBrut> =>
    source instanceof Map ? new Map(source) : new Map(Object.entries(source));

  const desVentes = lire(ventes);
  const desRecettes = lire(recettes);
  const jours = new Set([...desVentes.keys(), ...desRecettes.keys()]);

  return [...jours]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((day) => {
      const v = desVentes.get(day) || {};
      const r = desRecettes.get(day) || {};
      const salesAmount = round2(v.salesAmount);
      const otherAmount = round2(r.otherAmount);
      return {
        day,
        salesAmount,
        salesCount: Math.trunc(toNumber(v.salesCount)),
        otherAmount,
        otherCount: Math.trunc(toNumber(r.otherCount)),
        total: round2(salesAmount + otherAmount),
      };
    });
}

/**
 * Totaux du cahier, recomposés depuis ses journées.
 *
 * Recomposer plutôt que demander un second agrégat au serveur garantit que le
 * total affiché en tête est bien la somme des lignes affichées dessous. Un
 * en-tête qui ne se retrouve pas dans son propre tableau est pire qu'absent.
 */
export function bookTotals(days: readonly TakingsDay[]): {
  salesTotal: Money;
  otherTotal: Money;
  total: Money;
} {
  const salesTotal = round2(days.reduce((somme, jour) => somme + toNumber(jour.salesAmount), 0));
  const otherTotal = round2(days.reduce((somme, jour) => somme + toNumber(jour.otherAmount), 0));
  return { salesTotal, otherTotal, total: round2(salesTotal + otherTotal) };
}
