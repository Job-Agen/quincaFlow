import { describe, expect, it } from 'vitest';
import { canReceive, orderTotal, receptionStatus, remainingOf } from '../purchase';

/** L'exemple du PRD : 50 sacs commandés, 30 reçus, puis les 20 derniers (§22). */
const order = (received) => [
  { quantity_ordered: 50, quantity_received: received, unit_cost: 4000 },
  { quantity_ordered: 10, quantity_received: 0, unit_cost: 12000 },
];

describe('orderTotal', () => {
  it('additionne quantité × coût de chaque ligne', () => {
    expect(orderTotal(order(0))).toBe(320000);
  });

  it('accepte les champs en camelCase venus du formulaire', () => {
    expect(orderTotal([{ quantity: 3, unitCost: 1500 }])).toBe(4500);
  });
});

describe('remainingOf', () => {
  it('donne ce qui reste à livrer', () => {
    expect(remainingOf({ quantity_ordered: 50, quantity_received: 30 })).toBe(20);
  });

  it('ne descend jamais sous zéro', () => {
    expect(remainingOf({ quantity_ordered: 50, quantity_received: 60 })).toBe(0);
  });
});

describe('receptionStatus', () => {
  it("laisse le statut administratif tant que rien n'est reçu", () => {
    expect(receptionStatus(order(0), 'PAID')).toBe('PAID');
  });

  it('passe en partiellement livrée dès la première réception', () => {
    expect(receptionStatus(order(30), 'PAID')).toBe('PARTIALLY_RECEIVED');
  });

  it('ne passe à livrée que lorsque toutes les lignes sont soldées', () => {
    expect(receptionStatus(order(50), 'PAID')).toBe('PARTIALLY_RECEIVED');
    expect(
      receptionStatus(
        [
          { quantity_ordered: 50, quantity_received: 50 },
          { quantity_ordered: 10, quantity_received: 10 },
        ],
        'PAID'
      )
    ).toBe('RECEIVED');
  });

  it('laisse une commande annulée annulée', () => {
    expect(receptionStatus(order(50), 'CANCELLED')).toBe('CANCELLED');
  });
});

describe('canReceive', () => {
  it("autorise la réception tant qu'il reste des lignes", () => {
    expect(canReceive({ status: 'PAID' }, order(30))).toBe(true);
  });

  it('refuse une commande annulée', () => {
    expect(canReceive({ status: 'CANCELLED' }, order(0))).toBe(false);
  });

  it('refuse une commande entièrement livrée', () => {
    expect(
      canReceive({ status: 'RECEIVED' }, [
        { quantity_ordered: 50, quantity_received: 50 },
        { quantity_ordered: 10, quantity_received: 10 },
      ])
    ).toBe(false);
  });
});
