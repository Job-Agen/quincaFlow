import { describe, expect, it } from 'vitest';
import {
  EXPENSE_CATEGORIES,
  discountedShare,
  granularityOf,
  isOperating,
  marginRate,
  netProfit,
  periodTotals,
} from '../report';
import type { ExpenseCategory } from '@/types';

/**
 * Calculs des rapports financiers (§39).
 *
 * Le PRD pose au §13 que marge brute ≠ bénéfice net. Ces tests gardent l'écart :
 * c'est la seule différence entre un état de gestion utile et un chiffre qui
 * annonce au commerçant un gain déjà parti en loyer.
 */

describe('netProfit', () => {
  it('retranche les dépenses de la marge brute', () => {
    expect(netProfit(82300, 30000)).toBe(52300);
  });

  it('vaut la marge brute quand aucune dépense n’est saisie', () => {
    // Le cas dangereux : sans dépense, le « bénéfice net » est une marge brute.
    // Le calcul ne peut pas l'inventer ; c'est l'écran qui doit le dire (§39).
    expect(netProfit(82300, 0)).toBe(82300);
  });

  it('descend sous zéro quand le loyer dépasse la marge', () => {
    // Un mois déficitaire est précisément ce que le gérant doit voir.
    expect(netProfit(40000, 65000)).toBe(-25000);
  });
});

describe('postes de dépense', () => {
  it('garde les six postes du §40 dans leur ordre', () => {
    expect([...EXPENSE_CATEGORIES]).toEqual([
      'RENT',
      'UTILITIES',
      'SALARY',
      'STOCK_PURCHASE',
      'TRANSPORT',
      'OTHER',
    ]);
  });

  it('ne compte pas l’achat de stock comme une charge de la période', () => {
    // La marchandise est déjà comptée au coût des marchandises vendues (§13) :
    // la déduire ici ferait payer deux fois le même sac de ciment.
    expect(isOperating('STOCK_PURCHASE')).toBe(false);
    ['RENT', 'UTILITIES', 'SALARY', 'TRANSPORT', 'OTHER'].forEach((category) => {
      expect(isOperating(category as ExpenseCategory)).toBe(true);
    });
  });
});

describe('marginRate', () => {
  it('exprime la marge en pourcentage du chiffre d’affaires', () => {
    expect(marginRate(82300, 385500)).toBe(21.3);
  });

  it('ne rend aucun taux quand rien n’a été vendu', () => {
    // Zéro se lirait « vendu sans marge » ; rien n'a été vendu du tout.
    expect(marginRate(0, 0)).toBeNull();
    expect(marginRate(0, -10)).toBeNull();
  });
});

describe('periodTotals', () => {
  it('additionne ventes en stock et hors stock jusqu’au bénéfice net', () => {
    const totals = periodTotals({
      salesRevenue: 385500,
      salesCost: 303200,
      outOfStockRevenue: 95000,
      outOfStockMargin: 15000,
      expenses: 42000,
    });

    expect(totals.revenue).toBe(480500);
    // Le coût hors stock se déduit de sa marge, figée à l'enregistrement (§16) :
    // 95 000 − 15 000 = 80 000, ce que le confrère a été payé.
    expect(totals.costOfGoods).toBe(383200);
    expect(totals.grossMargin).toBe(97300);
    expect(totals.netProfit).toBe(55300);
  });

  it('reconstitue la marge : chiffre d’affaires − coût', () => {
    const totals = periodTotals({
      salesRevenue: 19250,
      salesCost: 8743.75,
      outOfStockRevenue: 0,
      outOfStockMargin: 0,
      expenses: 0,
    });

    // La vente du §11 : 19 250 encaissés, 10 506,25 de marge.
    expect(totals.grossMargin).toBe(10506.25);
    expect(totals.revenue - totals.costOfGoods).toBeCloseTo(totals.grossMargin, 2);
    // Sans dépense, bénéfice net et marge brute coïncident — et c'est tout le
    // problème que le §39 demande d'annoncer.
    expect(totals.netProfit).toBe(totals.grossMargin);
  });

  it('sort l’achat de stock du bénéfice sans le retirer de la caisse', () => {
    const totals = periodTotals({
      salesRevenue: 100000,
      salesCost: 70000,
      outOfStockRevenue: 0,
      outOfStockMargin: 0,
      // 12 000 de charges réelles, plus 200 000 de réassort payé comptant.
      expenses: 212000,
      stockPurchases: 200000,
    });

    // Le mois reste rentable : 30 000 de marge − 12 000 de charges.
    expect(totals.grossMargin).toBe(30000);
    expect(totals.operatingExpenses).toBe(12000);
    expect(totals.netProfit).toBe(18000);
    // Mais la caisse, elle, a bien vu partir 212 000 (§40).
    expect(totals.expenses).toBe(212000);
    expect(totals.stockPurchases).toBe(200000);
  });

  it('accepte les chaînes que Postgres renvoie pour un numeric', () => {
    const totals = periodTotals({
      salesRevenue: '1000',
      salesCost: '600',
      outOfStockRevenue: '0',
      outOfStockMargin: '0',
      expenses: '250',
    });
    expect(totals.netProfit).toBe(150);
  });
});

describe('discountedShare', () => {
  it('répartit la remise au prorata du montant de ligne', () => {
    // Vente de 20 000 remisée de 2 000 : chaque ligne perd 10 % de sa valeur.
    expect(discountedShare(15000, 20000, 18000)).toBe(13500);
    expect(discountedShare(5000, 20000, 18000)).toBe(4500);
  });

  it('conserve la somme : les lignes réparties valent le total encaissé', () => {
    const lines = [15000, 3000, 2000];
    const subtotal = 20000;
    const total = 18000;
    const sum = lines.reduce((acc, line) => acc + discountedShare(line, subtotal, total), 0);
    // C'est l'invariant du §39 : la somme des produits égale le chiffre
    // d'affaires réellement encaissé, ni le sous-total ni davantage.
    expect(sum).toBeCloseTo(total, 2);
  });

  it('laisse la ligne intacte sans remise', () => {
    expect(discountedShare(15000, 20000, 20000)).toBe(15000);
  });

  it('rend zéro sur une vente à sous-total nul, sans diviser par zéro', () => {
    expect(discountedShare(0, 0, 0)).toBe(0);
  });
});

describe('granularityOf', () => {
  it('découpe par jour sur une période courte', () => {
    const from = new Date('2026-09-01T00:00:00.000Z').toISOString();
    const to = new Date('2026-09-30T23:59:59.999Z').toISOString();
    expect(granularityOf(from, to)).toBe('day');
  });

  it('passe au mois au-delà d’un trimestre', () => {
    const from = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const to = new Date('2026-09-30T23:59:59.999Z').toISOString();
    expect(granularityOf(from, to)).toBe('month');
  });

  it('découpe « Tout » par mois : deux ans de journées ne se lisent pas', () => {
    expect(granularityOf(null, null)).toBe('month');
  });
});
