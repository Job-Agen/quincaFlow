import { describe, expect, it } from 'vitest';
import {
  costPerBaseUnit,
  describeStock,
  findUnit,
  pricePerBaseUnit,
  toBaseQuantity,
  unitsOf,
  weightedAverageCost,
} from '../units';

const product = { id: 'p1', name: 'Vitre 60 cm', base_unit: 'pièce', selling_price: 450 };

describe('unitsOf', () => {
  it("ajoute l'unité de base quand le produit n'a aucun conditionnement", () => {
    const units = unitsOf(product, []);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ label: 'pièce', factor: 1, price: 450 });
  });

  it('trie du plus petit au plus grand conditionnement', () => {
    const units = unitsOf(product, [
      { id: 'u2', label: 'palette', factor: 200, price: 80000 },
      { id: 'u1', label: 'carton', factor: 40, price: 17000 },
      { id: 'u0', label: 'pièce', factor: 1, price: 450, is_base: true },
    ]);
    expect(units.map((unit) => unit.label)).toEqual(['pièce', 'carton', 'palette']);
  });

  it("réinjecte l'unité de base si la table ne la porte pas", () => {
    const units = unitsOf(product, [{ id: 'u1', label: 'carton', factor: 40, price: 17000 }]);
    expect(units.some((unit) => unit.factor === 1)).toBe(true);
  });

  it('écarte un conditionnement de facteur nul, qui ne convertit rien', () => {
    const units = unitsOf(product, [{ id: 'u1', label: 'lot', factor: 0, price: 100 }]);
    expect(units).toHaveLength(1);
  });
});

describe('findUnit', () => {
  const units = unitsOf(product, [{ id: 'u1', label: 'carton', factor: 40, price: 17000 }]);

  it('retrouve un conditionnement par son identifiant', () => {
    expect(findUnit(units, 'u1').label).toBe('carton');
  });

  it("retombe sur l'unité de base quand l'identifiant est inconnu", () => {
    expect(findUnit(units, 'inexistant').factor).toBe(1);
  });
});

describe('conversions', () => {
  const carton = { label: 'carton', factor: 40, price: 17000 };

  it('vendre 1 carton de 40 retire 40 unités de base', () => {
    expect(toBaseQuantity(carton, 1)).toBe(40);
    expect(toBaseQuantity(carton, 2.5)).toBe(100);
  });

  it('ramène le prix du lot au prix de la pièce', () => {
    expect(pricePerBaseUnit(carton)).toBe(425);
  });

  it("ramène le coût d'achat d'un carton payé 12 750 à 318,75 la pièce", () => {
    expect(costPerBaseUnit(12750, carton)).toBe(318.75);
  });

  it("laisse le coût inchangé face à l'unité de base", () => {
    expect(costPerBaseUnit(450, { factor: 1 })).toBe(450);
  });
});

describe('weightedAverageCost', () => {
  it('pondère par les quantités plutôt que de retenir le dernier prix', () => {
    expect(weightedAverageCost(100, 300, 400, 320)).toBe(316);
  });

  it('adopte le coût du réassort quand le stock était vide', () => {
    expect(weightedAverageCost(0, 0, 50, 1200)).toBe(1200);
  });

  it('conserve le coût courant quand la réception est vide', () => {
    expect(weightedAverageCost(10, 500, 0, 999)).toBe(500);
  });
});

describe('describeStock', () => {
  const units = unitsOf(product, [
    { id: 'u1', label: 'carton', factor: 40, price: 17000 },
    { id: 'u2', label: 'palette', factor: 200, price: 80000 },
  ]);

  it('décompose du plus grand lot au plus petit', () => {
    expect(describeStock(462, units, 'pièce')).toBe('462 pièce (2 palettes + 1 carton + 22)');
  });

  it("n'affiche pas de décomposition quand il n'y a pas de lot entier", () => {
    expect(describeStock(22, units, 'pièce')).toBe('22 pièce');
  });
});
