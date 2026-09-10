import { describe, expect, it } from 'vitest';
import {
  baseQuantitiesByProduct,
  buildSaleLine,
  grossMargin,
  paymentStatusOf,
  totalsOf,
} from '../sale';
import { unitsOf } from '../units';

const vitre = {
  id: 'p1',
  name: 'Vitre 60 cm',
  base_unit: 'pièce',
  selling_price: 450,
  purchase_price: 318.75,
};
const units = unitsOf(vitre, [
  { id: 'u0', label: 'pièce', factor: 1, price: 450, is_base: true },
  { id: 'u1', label: 'carton', factor: 40, price: 17000 },
]);

describe('buildSaleLine', () => {
  it('applique le tarif du conditionnement choisi', () => {
    const line = buildSaleLine({ unitId: 'u1', quantity: 2 }, vitre, units);
    expect(line).toMatchObject({
      unitLabel: 'carton',
      unitPrice: 17000,
      lineTotal: 34000,
      baseQuantity: 80,
    });
  });

  it('accepte un prix négocié à la place du tarif', () => {
    const line = buildSaleLine({ unitId: 'u0', quantity: 5, unitPrice: 430 }, vitre, units);
    expect(line.lineTotal).toBe(2150);
  });

  it('retient le tarif quand le prix négocié est vide', () => {
    const line = buildSaleLine({ unitId: 'u0', quantity: 5, unitPrice: '' }, vitre, units);
    expect(line.unitPrice).toBe(450);
  });

  it("ramène le coût d'achat au conditionnement vendu", () => {
    const line = buildSaleLine({ unitId: 'u1', quantity: 1 }, vitre, units);
    expect(line.unitCost).toBe(12750);
    expect(line.lineCost).toBe(12750);
  });

  it("retombe sur l'unité de base si le conditionnement est inconnu", () => {
    const line = buildSaleLine({ unitId: 'disparu', quantity: 3 }, vitre, units);
    expect(line.unitLabel).toBe('pièce');
    expect(line.baseQuantity).toBe(3);
  });
});

describe('totalsOf', () => {
  // L'exemple du PRD : 3 serrures, 5 vitres, 20 vis → 19 250 FCFA.
  const lines = [
    { lineTotal: 15000, lineCost: 11000 },
    { lineTotal: 2250, lineCost: 1594 },
    { lineTotal: 2000, lineCost: 1200 },
  ];

  it('additionne les lignes', () => {
    expect(totalsOf(lines).total).toBe(19250);
  });

  it('déduit la remise du sous-total', () => {
    expect(totalsOf(lines, 250)).toMatchObject({ subtotal: 19250, discount: 250, total: 19000 });
  });

  it('plafonne la remise au sous-total : une vente ne peut pas être négative', () => {
    expect(totalsOf(lines, 999999).total).toBe(0);
  });

  it('ignore une remise négative', () => {
    expect(totalsOf(lines, -500).total).toBe(19250);
  });

  it('cumule le coût des marchandises vendues', () => {
    expect(totalsOf(lines).costOfGoods).toBe(13794);
  });
});

describe('grossMargin', () => {
  it("est la différence entre les ventes et le coût d'achat", () => {
    expect(grossMargin(19250, 13794)).toBe(5456);
  });

  it('peut être négative quand on vend à perte', () => {
    expect(grossMargin(1000, 1500)).toBe(-500);
  });
});

describe('paymentStatusOf', () => {
  it('déclare payée une vente réglée intégralement', () => {
    expect(paymentStatusOf(19250, 19250)).toBe('PAID');
  });

  it('déclare partielle une vente sous-réglée', () => {
    expect(paymentStatusOf(19250, 10000)).toBe('PARTIAL');
  });

  it('déclare impayée une vente sans encaissement', () => {
    expect(paymentStatusOf(19250, 0)).toBe('UNPAID');
  });

  it('considère payée une vente à zéro, sans encaissement à attendre', () => {
    expect(paymentStatusOf(0, 0)).toBe('PAID');
  });

  it('ne bascule pas en partielle sur un arrondi au centime', () => {
    expect(paymentStatusOf(19250, 19249.999)).toBe('PAID');
  });
});

describe('baseQuantitiesByProduct', () => {
  it('regroupe les lignes du même produit en une seule sortie de stock', () => {
    const totals = baseQuantitiesByProduct([
      { productId: 'p1', baseQuantity: 80 },
      { productId: 'p1', baseQuantity: 5 },
      { productId: 'p2', baseQuantity: 3 },
    ]);
    expect(totals.get('p1')).toBe(85);
    expect(totals.get('p2')).toBe(3);
    expect(totals.size).toBe(2);
  });
});
