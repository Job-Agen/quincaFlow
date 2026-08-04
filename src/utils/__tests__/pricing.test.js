import { describe, it, expect } from 'vitest';
import {
  RETAIL,
  WHOLESALE,
  hasWholesale,
  unitLabel,
  priceFor,
  unitsFor,
  packUnitPrice,
  wholesaleDiscount,
  wholesaleMargin,
  maxSellable,
  describeStock,
  packBreakdown,
  lineTotal,
  lineUnits,
} from '../pricing';

// L'exemple du terrain : lame de 60 cm, carton de 40 pièces.
const lame = {
  id: 'p1',
  name: 'Lame 60 cm',
  buyPrice: 250,
  sellPrice: 400,
  qty: 100,
  unit: 'pièce',
  packLabel: 'carton',
  packSize: 40,
  packPrice: 13000,
};

// Article sans conditionnement : détail uniquement.
const riz = {
  id: 'p2',
  name: 'Riz parfumé 25kg',
  buyPrice: 15000,
  sellPrice: 18500,
  qty: 40,
  unit: 'sac',
};

describe('hasWholesale', () => {
  it('reconnaît un article conditionné', () => {
    expect(hasWholesale(lame)).toBe(true);
  });

  it('refuse un article sans conditionnement', () => {
    expect(hasWholesale(riz)).toBe(false);
  });

  it('refuse un conditionnement sans prix', () => {
    expect(hasWholesale({ ...lame, packPrice: 0 })).toBe(false);
  });

  it('refuse un prix sans conditionnement', () => {
    expect(hasWholesale({ ...lame, packSize: 0 })).toBe(false);
  });

  it('tolère un article absent', () => {
    expect(hasWholesale(null)).toBe(false);
    expect(hasWholesale(undefined)).toBe(false);
  });
});

describe('priceFor', () => {
  it('donne le prix de la pièce en détail', () => {
    expect(priceFor(lame, RETAIL)).toBe(400);
  });

  it('donne le prix du carton entier en gros', () => {
    expect(priceFor(lame, WHOLESALE)).toBe(13000);
  });
});

describe('unitsFor', () => {
  it('compte les pièces telles quelles en détail', () => {
    expect(unitsFor(lame, RETAIL, 20)).toBe(20);
  });

  it('multiplie par le conditionnement en gros', () => {
    expect(unitsFor(lame, WHOLESALE, 1)).toBe(40);
    expect(unitsFor(lame, WHOLESALE, 3)).toBe(120);
  });
});

describe('packUnitPrice', () => {
  it('ramène le prix du carton à la pièce', () => {
    expect(packUnitPrice(lame)).toBe(325);
  });

  it('vaut null sans conditionnement', () => {
    expect(packUnitPrice(riz)).toBeNull();
  });
});

describe('wholesaleDiscount', () => {
  it('mesure la remise du gros contre le détail', () => {
    // 400 → 325 la pièce, soit 18,75 % de remise
    expect(wholesaleDiscount(lame)).toBeCloseTo(18.75, 5);
  });

  it('devient négative si le carton revient plus cher', () => {
    expect(wholesaleDiscount({ ...lame, packPrice: 20000 })).toBeLessThan(0);
  });
});

describe('wholesaleMargin', () => {
  it('calcule la marge du gros pièce par pièce', () => {
    // 250 d'achat, 325 de vente → 30 %
    expect(wholesaleMargin(lame)).toBeCloseTo(30, 5);
  });

  it('vaut null sans prix d’achat', () => {
    expect(wholesaleMargin({ ...lame, buyPrice: 0 })).toBeNull();
  });
});

describe('maxSellable', () => {
  it('rend tout le stock en détail', () => {
    expect(maxSellable(lame, RETAIL, 100)).toBe(100);
  });

  it('tronque les cartons incomplets en gros', () => {
    // 100 pièces = 2 cartons entiers, les 20 restantes ne font pas un carton
    expect(maxSellable(lame, WHOLESALE, 100)).toBe(2);
  });

  it('rend 0 quand le stock ne fait pas un carton', () => {
    expect(maxSellable(lame, WHOLESALE, 39)).toBe(0);
  });

  it('ne descend jamais sous zéro', () => {
    expect(maxSellable(lame, RETAIL, -5)).toBe(0);
    expect(maxSellable(lame, WHOLESALE, -5)).toBe(0);
  });

  it('rend 0 en gros sans conditionnement', () => {
    expect(maxSellable(riz, WHOLESALE, 40)).toBe(0);
  });
});

describe('describeStock', () => {
  it('détaille cartons entiers et reste', () => {
    expect(describeStock(lame)).toBe('100 pièce (2 cartons + 20)');
  });

  it('omet le reste quand les cartons tombent juste', () => {
    expect(describeStock({ ...lame, qty: 80 })).toBe('80 pièce (2 cartons)');
  });

  it('accorde le singulier', () => {
    expect(describeStock({ ...lame, qty: 40 })).toBe('40 pièce (1 carton)');
  });

  it('reste sur l’unité de base sous un carton', () => {
    expect(describeStock({ ...lame, qty: 20 })).toBe('20 pièce');
  });

  it('ignore le conditionnement absent', () => {
    expect(describeStock(riz)).toBe('40 sac');
  });
});

describe('packBreakdown', () => {
  it('découpe en cartons entiers et reste', () => {
    expect(packBreakdown(lame)).toBe('2 cartons + 20');
  });

  it('omet le reste quand ça tombe juste', () => {
    expect(packBreakdown({ ...lame, qty: 80 })).toBe('2 cartons');
  });

  it('vaut null sous un carton', () => {
    expect(packBreakdown({ ...lame, qty: 39 })).toBeNull();
  });

  it('vaut null sans conditionnement', () => {
    expect(packBreakdown(riz)).toBeNull();
  });
});

describe('unitLabel', () => {
  it('nomme l’unité de base en détail', () => {
    expect(unitLabel(lame, RETAIL)).toBe('pièce');
  });

  it('nomme le conditionnement en gros', () => {
    expect(unitLabel(lame, WHOLESALE)).toBe('carton');
  });

  it('retombe sur « carton » sans libellé', () => {
    expect(unitLabel({ ...lame, packLabel: '' }, WHOLESALE)).toBe('carton');
  });
});

describe('lignes de panier', () => {
  const ligneDetail = { mode: RETAIL, qty: 20, unitPrice: 400, packSize: 40 };
  const ligneGros = { mode: WHOLESALE, qty: 1, unitPrice: 13000, packSize: 40 };

  it('totalise une ligne de détail', () => {
    expect(lineTotal(ligneDetail)).toBe(8000);
  });

  it('totalise une ligne de gros au prix du carton', () => {
    expect(lineTotal(ligneGros)).toBe(13000);
  });

  it('compte les pièces consommées en détail', () => {
    expect(lineUnits(ligneDetail)).toBe(20);
  });

  it('compte les pièces consommées en gros', () => {
    expect(lineUnits(ligneGros)).toBe(40);
  });

  it('cumule le stock des deux modes sur un même article', () => {
    // Le cas du client qui prend 1 carton et 20 pièces en plus
    expect(lineUnits(ligneDetail) + lineUnits(ligneGros)).toBe(60);
  });
});
