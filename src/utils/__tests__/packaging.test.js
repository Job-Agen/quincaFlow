import { describe, it, expect } from 'vitest';
import {
  RETAIL,
  WHOLESALE,
  modeOf,
  normalizePackagings,
  defaultPackaging,
  hasBulk,
  unitsOf,
  unitPriceOf,
  marginOf,
  discountOf,
  maxSellable,
  decomposeStock,
  describeStock,
  weightedAverageCost,
  clampQty,
  lineTotal,
  lineUnits,
  blankPackaging,
} from '../packaging';

// L'exemple métier de la spec : vitre 60 cm, achetée au carton de 40.
const vitre = {
  id: 'p1',
  name: 'Vitre 60 cm',
  unit: 'pièce',
  qty: 862,
  buyPrice: 318.75,
  packagings: [
    { id: 'a', label: 'pièce', size: 1, price: 450, isDefault: true },
    { id: 'b', label: 'carton', size: 40, price: 17000 },
    { id: 'c', label: 'palette', size: 400, price: 160000 },
  ],
};

// Article à l'ancien format, tel qu'il existe déjà en production.
const ancien = {
  id: 'p2',
  name: 'Lame de scie 60 cm',
  unit: 'pièce',
  qty: 100,
  buyPrice: 250,
  sellPrice: 400,
  packLabel: 'carton',
  packSize: 40,
  packPrice: 13000,
};

// Article sans aucun conditionnement.
const simple = { id: 'p3', name: 'Marteau', unit: 'unité', qty: 15, sellPrice: 3000, buyPrice: 2000 };

describe('normalizePackagings — compatibilité', () => {
  it('garde les conditionnements déjà au bon format, triés par taille', () => {
    const l = normalizePackagings(vitre);
    expect(l.map((p) => p.size)).toEqual([1, 40, 400]);
  });

  it('convertit l’ancien format en deux conditionnements', () => {
    const l = normalizePackagings(ancien);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ label: 'pièce', size: 1, price: 400, isDefault: true });
    expect(l[1]).toMatchObject({ label: 'carton', size: 40, price: 13000 });
  });

  it('donne l’unité de base seule quand il n’y a pas de conditionnement', () => {
    const l = normalizePackagings(simple);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ label: 'unité', size: 1, price: 3000 });
  });

  it('écarte les conditionnements sans taille', () => {
    const l = normalizePackagings({ unit: 'pièce', packagings: [
      { label: 'pièce', size: 1, price: 450 },
      { label: 'vide', size: 0, price: 900 },
    ] });
    expect(l).toHaveLength(1);
  });

  it('tolère un article absent', () => {
    expect(normalizePackagings(null)).toEqual([]);
  });
});

describe('defaultPackaging', () => {
  it('prend celui marqué par défaut', () => {
    expect(defaultPackaging(vitre).label).toBe('pièce');
  });

  it('retombe sur le plus petit sans marquage', () => {
    const p = { unit: 'pièce', packagings: [
      { label: 'carton', size: 40, price: 17000 },
      { label: 'pièce', size: 1, price: 450 },
    ] };
    expect(defaultPackaging(p).size).toBe(1);
  });
});

describe('hasBulk', () => {
  it('vrai dès qu’un conditionnement dépasse l’unité', () => {
    expect(hasBulk(vitre)).toBe(true);
    expect(hasBulk(ancien)).toBe(true);
  });

  it('faux pour un article vendu seulement à l’unité', () => {
    expect(hasBulk(simple)).toBe(false);
  });
});

describe('modeOf', () => {
  it('classe l’unité de base en détail', () => {
    expect(modeOf({ size: 1 })).toBe(RETAIL);
  });

  it('classe tout lot en gros', () => {
    expect(modeOf({ size: 40 })).toBe(WHOLESALE);
    expect(modeOf({ size: 400 })).toBe(WHOLESALE);
  });
});

describe('conversions', () => {
  const carton = { label: 'carton', size: 40, price: 17000 };
  const palette = { label: 'palette', size: 400, price: 160000 };

  it('convertit une quantité en unités de base', () => {
    expect(unitsOf(carton, 2)).toBe(80);
    expect(unitsOf(palette, 1)).toBe(400);
    expect(unitsOf({ size: 1 }, 7)).toBe(7);
  });

  it('ramène le prix à l’unité de base', () => {
    expect(unitPriceOf(carton)).toBe(425);
    expect(unitPriceOf(palette)).toBe(400);
  });

  it('calcule la marge contre le coût moyen', () => {
    // 318,75 de coût, 425 la pièce en carton
    expect(marginOf(carton, 318.75)).toBeCloseTo(33.33, 1);
    expect(marginOf(palette, 318.75)).toBeCloseTo(25.49, 1);
  });

  it('mesure la remise contre le prix unitaire', () => {
    expect(discountOf(carton, vitre)).toBeCloseTo(5.56, 1);
    expect(discountOf(palette, vitre)).toBeCloseTo(11.11, 1);
  });

  it('signale un lot plus cher que le détail', () => {
    expect(discountOf({ size: 40, price: 20000 }, vitre)).toBeLessThan(0);
  });
});

describe('maxSellable', () => {
  it('compte les lots entiers disponibles', () => {
    expect(maxSellable({ size: 40 }, 862)).toBe(21);
    expect(maxSellable({ size: 400 }, 862)).toBe(2);
    expect(maxSellable({ size: 1 }, 862)).toBe(862);
  });

  it('refuse un lot incomplet', () => {
    expect(maxSellable({ size: 40 }, 39)).toBe(0);
  });

  it('ne descend pas sous zéro', () => {
    expect(maxSellable({ size: 40 }, -100)).toBe(0);
  });
});

describe('decomposeStock', () => {
  it('décompose du plus grand au plus petit', () => {
    // 862 = 2 palettes (800) + 1 carton (40) + 22
    expect(decomposeStock(vitre)).toBe('2 palettes + 1 carton + 22');
  });

  it('omet le reste quand ça tombe juste', () => {
    expect(decomposeStock({ ...vitre, qty: 800 })).toBe('2 palettes');
  });

  it('accorde le singulier', () => {
    expect(decomposeStock({ ...vitre, qty: 400 })).toBe('1 palette');
  });

  it('vaut null sous le plus petit lot', () => {
    expect(decomposeStock({ ...vitre, qty: 30 })).toBeNull();
  });

  it('vaut null sans conditionnement', () => {
    expect(decomposeStock(simple)).toBeNull();
  });

  it('décrit le stock en toutes lettres', () => {
    expect(describeStock(vitre)).toBe('862 pièce (2 palettes + 1 carton + 22)');
    expect(describeStock(simple)).toBe('15 unité');
  });
});

describe('weightedAverageCost', () => {
  it('pondère par les quantités', () => {
    // 100 à 300 puis 400 à 320 → (30 000 + 128 000) / 500 = 316
    expect(weightedAverageCost(100, 300, 400, 320)).toBe(316);
  });

  it('prend le nouveau coût quand le stock était vide', () => {
    expect(weightedAverageCost(0, 0, 400, 318.75)).toBe(318.75);
  });

  it('garde l’ancien coût si rien n’est ajouté', () => {
    expect(weightedAverageCost(100, 300, 0, 999)).toBe(300);
  });

  it('donne le coût unitaire de la spec sur un premier achat', () => {
    // 10 cartons de 40 à 12 750 le carton → 400 pièces à 318,75
    const unites = unitsOf({ size: 40 }, 10);
    const coutUnitaire = (12750 * 10) / unites;
    expect(unites).toBe(400);
    expect(weightedAverageCost(0, 0, unites, coutUnitaire)).toBe(318.75);
  });
});

describe('lignes de panier', () => {
  const ligneCarton = { size: 40, qty: 2, unitPrice: 17000 };
  const lignePiece = { size: 1, qty: 7, unitPrice: 450 };

  it('totalise au prix du conditionnement', () => {
    expect(lineTotal(ligneCarton)).toBe(34000);
    expect(lineTotal(lignePiece)).toBe(3150);
  });

  it('compte les unités de base retirées', () => {
    expect(lineUnits(ligneCarton)).toBe(80);
    expect(lineUnits(lignePiece)).toBe(7);
  });

  it('cumule plusieurs conditionnements du même article', () => {
    expect(lineUnits(ligneCarton) + lineUnits(lignePiece)).toBe(87);
  });
});

describe('clampQty', () => {
  it('borne par le stock vendable', () => {
    expect(clampQty(30, 21)).toBe(21);
  });

  it('ne tombe jamais à zéro', () => {
    expect(clampQty(0, 21)).toBe(1);
    expect(clampQty(5, 0)).toBe(1);
  });
});

describe('blankPackaging', () => {
  it('produit des identifiants distincts', () => {
    expect(blankPackaging().id).not.toBe(blankPackaging().id);
  });
});
