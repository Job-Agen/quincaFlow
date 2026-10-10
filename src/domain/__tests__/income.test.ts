import { describe, expect, it } from 'vitest';
import {
  INCOME_CATEGORIES,
  INCOME_CATEGORY_LABELS,
  NON_REVENUE_CATEGORIES,
  bookTotals,
  isRevenue,
  mergeDays,
  revenueShare,
} from '../income';
import { periodTotals } from '../report';
import type { IncomeBucket } from '@/types';

/**
 * Cahier de recettes (§42).
 *
 * Le cœur de ces tests est une seule règle, et c'est celle qui coûterait cher si
 * elle se rompait : un remboursement de dette entre en caisse sans être du
 * chiffre d'affaires. Le reste vérifie que les totaux affichés se retrouvent
 * dans les lignes affichées.
 */

describe('postes de recette', () => {
  it('porte les cinq postes du PRD, chacun avec un libellé', () => {
    expect(INCOME_CATEGORIES).toHaveLength(5);
    for (const poste of INCOME_CATEGORIES) {
      expect(INCOME_CATEGORY_LABELS[poste]).toBeTruthy();
    }
  });

  it('ne compte pas un remboursement de dette comme chiffre d’affaires', () => {
    expect(isRevenue('DEBT_REPAYMENT')).toBe(false);
    expect(NON_REVENUE_CATEGORIES).toEqual(['DEBT_REPAYMENT']);
  });

  it('compte les quatre autres postes comme chiffre d’affaires', () => {
    expect(isRevenue('SERVICE')).toBe(true);
    expect(isRevenue('DELIVERY')).toBe(true);
    expect(isRevenue('RENTAL')).toBe(true);
    expect(isRevenue('OTHER')).toBe(true);
  });
});

describe('revenueShare', () => {
  const postes: IncomeBucket[] = [
    { category: 'SERVICE', amount: 12000, count: 3 },
    { category: 'RENTAL', amount: 5000, count: 1 },
    { category: 'DEBT_REPAYMENT', amount: 40000, count: 2 },
  ];

  it('retient les recettes et écarte les remboursements', () => {
    // 12 000 + 5 000 ; les 40 000 remboursés ont déjà été comptés à la vente.
    expect(revenueShare(postes)).toBe(17000);
  });

  it('rend zéro quand tout est remboursement', () => {
    expect(revenueShare([{ category: 'DEBT_REPAYMENT', amount: 40000, count: 2 }])).toBe(0);
  });

  it('rend zéro sur un cahier vide', () => {
    expect(revenueShare([])).toBe(0);
  });
});

describe('mergeDays', () => {
  it('réunit les deux origines par leur date, du plus récent au plus ancien', () => {
    const jours = mergeDays(
      {
        '2026-10-05': { salesAmount: 60000, salesCount: 4 },
        '2026-10-07': { salesAmount: 20000, salesCount: 1 },
      },
      {
        '2026-10-06': { otherAmount: 5000, otherCount: 1 },
        '2026-10-07': { otherAmount: 12000, otherCount: 2 },
      }
    );

    expect(jours.map((j) => j.day)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05']);
    expect(jours[0]).toMatchObject({
      salesAmount: 20000,
      salesCount: 1,
      otherAmount: 12000,
      otherCount: 2,
      total: 32000,
    });
    // Un jour sans vente existe quand même : la recette seule le fait exister.
    expect(jours[1]).toMatchObject({
      salesAmount: 0,
      salesCount: 0,
      otherAmount: 5000,
      total: 5000,
    });
    // Et réciproquement.
    expect(jours[2]).toMatchObject({ salesAmount: 60000, otherAmount: 0, total: 60000 });
  });

  it('accepte aussi des Map, que le serveur produit naturellement', () => {
    const jours = mergeDays(
      new Map([['2026-10-07', { salesAmount: 1000, salesCount: 1 }]]),
      new Map([['2026-10-07', { otherAmount: 500, otherCount: 1 }]])
    );
    expect(jours).toHaveLength(1);
    expect(jours[0]?.total).toBe(1500);
  });

  it('rend un cahier vide quand rien n’est entré', () => {
    expect(mergeDays({}, {})).toEqual([]);
  });
});

describe('bookTotals', () => {
  it('est exactement la somme des journées affichées', () => {
    const jours = mergeDays(
      {
        '2026-10-05': { salesAmount: 60000, salesCount: 4 },
        '2026-10-07': { salesAmount: 20000, salesCount: 1 },
      },
      {
        '2026-10-06': { otherAmount: 5000, otherCount: 1 },
        '2026-10-07': { otherAmount: 12000, otherCount: 2 },
      }
    );
    const totaux = bookTotals(jours);

    expect(totaux.salesTotal).toBe(80000);
    expect(totaux.otherTotal).toBe(17000);
    expect(totaux.total).toBe(97000);
    // La propriété qui compte : l'en-tête se retrouve dans le tableau.
    expect(totaux.total).toBe(jours.reduce((n, j) => n + j.total, 0));
  });
});

describe('effet sur les rapports financiers (§39)', () => {
  const base = {
    salesRevenue: 60000,
    salesCost: 51000,
    outOfStockRevenue: 0,
    outOfStockMargin: 0,
    expenses: 0,
  };

  it('un service rendu augmente la recette et la marge, sans toucher au coût', () => {
    const sans = periodTotals(base);
    const avec = periodTotals({ ...base, otherRevenue: 12000 });

    expect(avec.revenue).toBe(72000);
    expect(avec.costOfGoods).toBe(sans.costOfGoods);
    // Sans marchandise derrière, la somme passe entière en marge.
    expect(avec.grossMargin).toBe(sans.grossMargin + 12000);
    expect(avec.netProfit).toBe(sans.netProfit + 12000);
  });

  it('un remboursement de dette ne change rien aux rapports', () => {
    // `revenueShare` l'a écarté en amont : le §39 reçoit zéro.
    const postes: IncomeBucket[] = [{ category: 'DEBT_REPAYMENT', amount: 40000, count: 1 }];
    const avec = periodTotals({ ...base, otherRevenue: revenueShare(postes) });

    expect(avec.revenue).toBe(60000);
    expect(avec.grossMargin).toBe(periodTotals(base).grossMargin);
  });

  it('le taux de marge se calcule sur la recette augmentée', () => {
    // 21 000 de marge sur 72 000 de recette = 29,2 %.
    expect(periodTotals({ ...base, otherRevenue: 12000 }).marginRate).toBe(29.2);
  });
});
