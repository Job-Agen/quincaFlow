import { describe, expect, it } from 'vitest';
import { isLowStock, isOutOfStock } from '../stock';

describe('isLowStock', () => {
  it('alerte dès que le stock atteint le seuil', () => {
    expect(isLowStock({ stock_quantity: 10, low_stock_threshold: 10 })).toBe(true);
    expect(isLowStock({ stock_quantity: 11, low_stock_threshold: 10 })).toBe(false);
  });

  it("n'alerte jamais quand aucun seuil n'est fixé", () => {
    expect(isLowStock({ stock_quantity: 0, low_stock_threshold: 0 })).toBe(false);
  });

  it('accepte les champs en camelCase venus du client', () => {
    expect(isLowStock({ stockQuantity: 2, lowStockThreshold: 5 })).toBe(true);
  });
});

describe('isOutOfStock', () => {
  it('signale la rupture à zéro et en dessous', () => {
    expect(isOutOfStock({ stock_quantity: 0 })).toBe(true);
    expect(isOutOfStock({ stock_quantity: 0.5 })).toBe(false);
  });
});
