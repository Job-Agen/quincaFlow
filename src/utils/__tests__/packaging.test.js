import { describe, it, expect } from 'vitest';
import {
  RETAIL,
  WHOLESALE,
  modeOf,
  blankPackaging,
  normalizePackagings,
  hasBulk,
  unitsOf,
  unitPriceOf,
  marginOf,
  discountOf,
  unitBuyPrice,
  weightedAverageCost,
  maxSellable,
  clampQty,
  decomposeStock,
  describeStock,
  lineTotal,
  lineUnits,
} from '../packaging';

// Le cas réel : vitre 60 cm, achetée au carton de 40, revendue à la pièce
// (450) et au carton (17 000).
const vitre = {
  name: 'Vitre 60 cm',
  unit: 'pièce',
  qty: 862,
  buyPrice: 318.75,
  packagings: [
    { id: 'a', label: 'pièce', size: 1, price: 450 },
    { id: 'b', label: 'carton', size: 40, price: 17000 },
    { id: 'c', label: 'palette', size: 400, price: 160000 },
  ],
};

// Article d'avant les conditionnements, tel qu'il existe déjà en production.
const ancien = { name: 'Marteau', unit: 'unité', qty: 15, buyPrice: 2000, sellPrice: 3000 };

const carton = { label: 'carton', size: 40, price: 17000 };
const palette = { label: 'palette', size: 400, price: 160000 };
const piece = { label: 'pièce', size: 1, price: 450 };

describe('normalizePackagings', () => {
  it('trie les conditionnements du plus petit au plus grand', () => {
    expect(normalizePackagings(vitre).map((p) => p.size)).toEqual([1, 40, 400]);
  });

  it('convertit un article sans conditionnement en unité de base seule', () => {
    const l = normalizePackagings(ancien);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ label: 'unité', size: 1, price: 3000 });
  });

  it('écarte un conditionnement sans taille', () => {
    const l = normalizePackagings({
      unit: 'pièce',
      packagings: [{ label: 'pièce', size: 1, price: 450 }, { label: 'vide', size: 0, price: 900 }],
    });
    expect(l).toHaveLength(1);
  });

  it('remplace un libellé vide par l’unité de base', () => {
    const l = normalizePackagings({ unit: 'pièce', packagings: [{ label: '  ', size: 1, price: 450 }] });
    expect(l[0].label).toBe('pièce');
  });

  it('tolère un article absent', () => {
    expect(normalizePackagings(null)).toEqual([]);
    expect(normalizePackagings(undefined)).toEqual([]);
  });
});

describe('hasBulk / modeOf', () => {
  it('reconnaît un article vendable en gros', () => {
    expect(hasBulk(vitre)).toBe(true);
  });

  it('refuse un article vendu seulement à l’unité', () => {
    expect(hasBulk(ancien)).toBe(false);
  });

  it('classe l’unité de base en détail et les lots en gros', () => {
    expect(modeOf(piece)).toBe(RETAIL);
    expect(modeOf(carton)).toBe(WHOLESALE);
    expect(modeOf(palette)).toBe(WHOLESALE);
  });
});

describe('conversions', () => {
  it('convertit une quantité vendue en unités de base', () => {
    expect(unitsOf(carton, 2)).toBe(80);
    expect(unitsOf(palette, 1)).toBe(400);
    expect(unitsOf(piece, 7)).toBe(7);
  });

  it('ramène un prix de lot à l’unité de base', () => {
    expect(unitPriceOf(carton)).toBe(425);
    expect(unitPriceOf(palette)).toBe(400);
    expect(unitPriceOf(piece)).toBe(450);
  });

  it('vaut null pour un conditionnement sans taille', () => {
    expect(unitPriceOf({ size: 0, price: 900 })).toBeNull();
  });
});

describe('marges et remises', () => {
  it('calcule la marge face au coût moyen', () => {
    expect(marginOf(piece, 318.75)).toBeCloseTo(41.18, 1);
    expect(marginOf(carton, 318.75)).toBeCloseTo(33.33, 1);
    expect(marginOf(palette, 318.75)).toBeCloseTo(25.49, 1);
  });

  it('vaut null sans coût connu', () => {
    expect(marginOf(carton, 0)).toBeNull();
  });

  it('mesure la remise du lot contre le prix de détail', () => {
    expect(discountOf(carton, vitre)).toBeCloseTo(5.56, 1);
    expect(discountOf(palette, vitre)).toBeCloseTo(11.11, 1);
  });

  it('devient négative quand le lot revient plus cher que le détail', () => {
    expect(discountOf({ size: 40, price: 20000 }, vitre)).toBeLessThan(0);
  });
});

describe('unitBuyPrice — acheter en gros', () => {
  it('ramène le prix du carton à la pièce', () => {
    expect(unitBuyPrice(12750, carton)).toBe(318.75);
  });

  it('laisse un prix déjà exprimé à l’unité', () => {
    expect(unitBuyPrice(318.75, null)).toBe(318.75);
    expect(unitBuyPrice(450, piece)).toBe(450);
  });

  it('ne divise pas par une taille inconnue', () => {
    expect(unitBuyPrice(12750, { size: 0 })).toBe(12750);
  });

  it('donne une marge cohérente sur le cas réel', () => {
    const cout = unitBuyPrice(12750, carton);
    expect(marginOf(piece, cout)).toBeCloseTo(41.18, 1);
    expect(marginOf(carton, cout)).toBeCloseTo(33.33, 1);
  });
});

describe('weightedAverageCost — réapprovisionner', () => {
  it('pondère par les quantités', () => {
    expect(weightedAverageCost(100, 300, 400, 320)).toBe(316);
  });

  it('prend le nouveau coût quand le stock était vide', () => {
    expect(weightedAverageCost(0, 0, 400, 318.75)).toBe(318.75);
  });

  it('garde l’ancien coût si rien n’entre', () => {
    expect(weightedAverageCost(100, 300, 0, 999)).toBe(300);
  });

  it('donne 318,75 sur un premier achat de 10 cartons de 40 à 12 750', () => {
    const unites = unitsOf(carton, 10);
    expect(unites).toBe(400);
    expect(weightedAverageCost(0, 0, unites, unitBuyPrice(12750, carton))).toBe(318.75);
  });

  it('ne fait pas sauter la marge quand le prix fournisseur monte', () => {
    // 400 pièces à 318,75, puis 400 de plus à 13 500 le carton (337,50)
    const apres = weightedAverageCost(400, 318.75, 400, unitBuyPrice(13500, carton));
    expect(apres).toBe(328.125);
    expect(marginOf(piece, apres)).toBeGreaterThan(35);
  });
});

describe('maxSellable', () => {
  it('compte les lots entiers disponibles', () => {
    expect(maxSellable(carton, 862)).toBe(21);
    expect(maxSellable(palette, 862)).toBe(2);
    expect(maxSellable(piece, 862)).toBe(862);
  });

  it('refuse un lot incomplet', () => {
    expect(maxSellable(carton, 39)).toBe(0);
  });

  it('ne descend pas sous zéro', () => {
    expect(maxSellable(carton, -100)).toBe(0);
  });
});

describe('clampQty', () => {
  it('laisse passer une quantité dans les bornes', () => {
    expect(clampQty(12, 21)).toBe(12);
  });

  it('plafonne au stock vendable', () => {
    expect(clampQty(30, 21)).toBe(21);
  });

  it('ne tombe jamais à zéro, même sans stock vendable', () => {
    expect(clampQty(0, 21)).toBe(1);
    expect(clampQty(5, 0)).toBe(1);
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
    expect(decomposeStock(ancien)).toBeNull();
  });

  it('décrit le stock en toutes lettres', () => {
    expect(describeStock(vitre)).toBe('862 pièce (2 palettes + 1 carton + 22)');
    expect(describeStock(ancien)).toBe('15 unité');
  });
});

describe('lignes de panier', () => {
  const ligneCarton = { size: 40, qty: 2, unitPrice: 17000 };
  const lignePiece = { size: 1, qty: 7, unitPrice: 450 };

  it('totalise au prix du conditionnement', () => {
    expect(lineTotal(ligneCarton)).toBe(34000);
    expect(lineTotal(lignePiece)).toBe(3150);
  });

  it('compte les unités de base retirées du stock', () => {
    expect(lineUnits(ligneCarton)).toBe(80);
    expect(lineUnits(lignePiece)).toBe(7);
  });

  it('vend gros et détail du même article sur le même stock', () => {
    // Le client qui prend 2 cartons et 7 pièces
    expect(lineTotal(ligneCarton) + lineTotal(lignePiece)).toBe(37150);
    expect(862 - lineUnits(ligneCarton) - lineUnits(lignePiece)).toBe(775);
  });
});

describe('blankPackaging', () => {
  it('produit des identifiants distincts', () => {
    expect(blankPackaging().id).not.toBe(blankPackaging().id);
  });
});
