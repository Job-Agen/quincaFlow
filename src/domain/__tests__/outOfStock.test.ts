import { describe, expect, it } from 'vitest';
import { OOS_FLOW, canTransition, flowIndex, marginOf } from '../outOfStock';

describe('marginOf', () => {
  it("est l'écart entre ce que paie le client et ce que coûte le confrère", () => {
    // L'exemple du PRD : 95 000 − 80 000 = 15 000 (§16).
    expect(marginOf({ quantity: 1, costPrice: 80000, sellingPrice: 95000 })).toBe(15000);
  });

  it('multiplie par la quantité', () => {
    expect(marginOf({ quantity: 3, costPrice: 80000, sellingPrice: 95000 })).toBe(45000);
  });

  it('traite une quantité absente comme une unité', () => {
    expect(marginOf({ costPrice: 100, sellingPrice: 150 })).toBe(50);
  });

  it('devient négative quand on revend moins cher que le confrère', () => {
    expect(marginOf({ quantity: 1, costPrice: 95000, sellingPrice: 80000 })).toBe(-15000);
  });
});

describe('canTransition', () => {
  it("n'avance que d'une étape à la fois", () => {
    expect(canTransition('TO_SOURCE', 'SOURCED')).toBe(true);
    expect(canTransition('TO_SOURCE', 'CUSTOMER_PAID')).toBe(false);
    expect(canTransition('TO_SOURCE', 'COMPLETED')).toBe(false);
  });

  it('ne revient pas en arrière', () => {
    expect(canTransition('CUSTOMER_PAID', 'SOURCED')).toBe(false);
  });

  it("autorise l'annulation à tout moment tant que l'opération court", () => {
    OOS_FLOW.slice(0, -1).forEach((status) => {
      expect(canTransition(status, 'CANCELLED')).toBe(true);
    });
  });

  it('fige une opération terminée ou annulée', () => {
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'SOURCED')).toBe(false);
  });
});

describe('flowIndex', () => {
  it('situe le statut dans le flux', () => {
    expect(flowIndex('TO_SOURCE')).toBe(0);
    expect(flowIndex('COMPLETED')).toBe(OOS_FLOW.length - 1);
  });

  it('place hors flux une opération annulée', () => {
    expect(flowIndex('CANCELLED')).toBe(-1);
  });
});
