import { describe, expect, it } from 'vitest';
import { orderBalance, receivedValue, tooMuch } from '../supplierDebt';

/**
 * Ce que la boutique doit à ses fournisseurs (§53).
 *
 * La règle que ces tests gardent tient en une phrase : on ne doit que ce qui
 * est arrivé. Tout le reste en découle — une commande passée n'engage rien, une
 * livraison partielle n'engage que sa part.
 */

describe('valeur de ce qui est livré', () => {
  it('compte les quantités reçues, pas les quantités commandées', () => {
    // 40 sacs commandés, 10 livrés : la boutique doit 10 sacs, pas 40.
    expect(receivedValue([{ quantity_received: 10, unit_cost: 3800 }])).toBe(38000);
  });

  it('additionne les lignes d’une même commande', () => {
    expect(
      receivedValue([
        { quantity_received: 10, unit_cost: 3800 },
        { quantity_received: 20, unit_cost: 4500 },
      ])
    ).toBe(128000);
  });

  it('ne doit rien sur une commande dont rien n’est arrivé', () => {
    expect(receivedValue([{ quantity_received: 0, unit_cost: 3800 }])).toBe(0);
    expect(receivedValue([])).toBe(0);
  });

  it('arrondit au centime une fois, à la fin', () => {
    // Trois lignes à 0,335 : arrondies une à une elles donneraient 1,02.
    expect(receivedValue([{ quantity_received: 3, unit_cost: 0.335 }])).toBe(1.01);
  });
});

describe('reste dû sur une commande', () => {
  it('retranche ce qui a déjà été réglé', () => {
    expect(orderBalance(128000, 50000)).toBe(78000);
  });

  it('ne descend jamais sous zéro', () => {
    // Un règlement passé avant une annulation de ligne laisserait sinon une
    // dette négative, qui se lirait comme un avoir que personne ne doit.
    expect(orderBalance(38000, 50000)).toBe(0);
  });

  it('solde une commande entièrement payée', () => {
    expect(orderBalance(128000, 128000)).toBe(0);
  });
});

describe('dépassement', () => {
  it('refuse un versement supérieur au reste dû', () => {
    expect(tooMuch(78001, 78000)).toBe(true);
  });

  it('accepte le solde exact', () => {
    expect(tooMuch(78000, 78000)).toBe(false);
  });
});
