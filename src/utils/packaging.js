/**
 * Achat en gros, vente en gros et au détail.
 *
 * Un article n'a qu'un seul stock, compté dans son unité de base — la pièce.
 * Un conditionnement (carton, sac, palette) n'est pas un stock à part : c'est
 * un facteur de conversion et un prix. Vendre un carton de 40 retire 40 pièces
 * de ce stock unique, ce qui gère naturellement les cartons entamés et évite
 * d'avoir à réconcilier un « stock gros » avec un « stock détail ».
 *
 * Sur un article :
 *   unit         unité de base, ex. « pièce »
 *   qty          stock, en unités de base
 *   buyPrice     coût moyen pondéré, par unité de base
 *   packagings   [{ id, label, size, price }]
 *                  size  = unités de base contenues (1 pour l'unité de base)
 *                  price = prix de vente du conditionnement entier
 *
 * Les articles créés avant cette évolution n'ont pas de `packagings` :
 * normalizePackagings les convertit à la lecture, sans migration ni perte.
 */

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Vendre à l'unité de base, c'est du détail ; par lot, c'est du gros. */
export const RETAIL = 'détail';
export const WHOLESALE = 'gros';

export function modeOf(packaging) {
  return num(packaging && packaging.size) > 1 ? WHOLESALE : RETAIL;
}

let seq = 0;
function makeId() {
  // crypto.randomUUID manque dans jsdom et sur les navigateurs anciens.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  seq += 1;
  return `pkg_${Date.now()}_${seq}`;
}

/** Conditionnement neuf, prêt à être édité dans un formulaire. */
export function blankPackaging(label = '', size = '', price = '') {
  return { id: makeId(), label, size, price };
}

/**
 * Conditionnements d'un article, normalisés et triés du plus petit au plus
 * grand. Il y en a toujours au moins un : l'unité de base.
 */
export function normalizePackagings(product) {
  if (!product) return [];
  const baseUnit = product.unit || 'unité';

  if (Array.isArray(product.packagings) && product.packagings.length > 0) {
    return product.packagings
      .map((p) => ({
        id: p.id || makeId(),
        label: (p.label || '').trim() || baseUnit,
        size: num(p.size),
        price: num(p.price),
      }))
      .filter((p) => p.size > 0)
      .sort((a, b) => a.size - b.size);
  }

  // Article d'avant les conditionnements : l'unité de base au prix de vente.
  return [{ id: 'base', label: baseUnit, size: 1, price: num(product.sellPrice) }];
}

/** Un article vend en gros dès qu'un conditionnement dépasse l'unité de base. */
export function hasBulk(product) {
  return normalizePackagings(product).some((p) => p.size > 1);
}

/** Unités de base retirées du stock pour `qty` conditionnements vendus. */
export function unitsOf(packaging, qty) {
  return num(packaging && packaging.size) * num(qty);
}

/**
 * Prix ramené à l'unité de base. C'est la seule grandeur qui permette de
 * comparer un tarif au détail et un tarif en gros.
 */
export function unitPriceOf(packaging) {
  const size = num(packaging && packaging.size);
  if (size <= 0) return null;
  return num(packaging.price) / size;
}

/** Marge d'un conditionnement face au coût moyen, en pourcentage. */
export function marginOf(packaging, unitCost) {
  const cost = num(unitCost);
  const perUnit = unitPriceOf(packaging);
  if (cost <= 0 || perUnit === null) return null;
  return ((perUnit - cost) / cost) * 100;
}

/**
 * Remise d'un conditionnement face au prix de détail.
 * Négative quand le lot revient plus cher que la pièce — saisie à revoir.
 */
export function discountOf(packaging, product) {
  const base = normalizePackagings(product).find((p) => p.size === 1);
  const ref = base ? num(base.price) : 0;
  const perUnit = unitPriceOf(packaging);
  if (ref <= 0 || perUnit === null) return null;
  return ((ref - perUnit) / ref) * 100;
}

/**
 * Prix d'achat ramené à l'unité de base.
 *
 * On achète au carton et on revend à la pièce : un carton de 40 payé 12 750
 * revient à 318,75 la pièce. Conserver 12 750 tel quel afficherait une marge
 * de −96 % et surévaluerait le stock d'un facteur égal au conditionnement.
 */
export function unitBuyPrice(paidPrice, packaging) {
  const size = num(packaging && packaging.size);
  const paid = num(paidPrice);
  if (!packaging || size <= 0) return paid;
  return paid / size;
}

/**
 * Coût moyen pondéré après un réapprovisionnement.
 *
 * Réassortir 400 pièces à 320 quand on en détient 100 à 300 ne donne pas 320
 * mais (100×300 + 400×320) / 500 = 316. Sans cette pondération, les marges
 * sauteraient à chaque achat au prix du jour.
 */
export function weightedAverageCost(currentUnits, currentCost, addedUnits, addedUnitCost) {
  const q0 = Math.max(0, num(currentUnits));
  const c0 = Math.max(0, num(currentCost));
  const q1 = Math.max(0, num(addedUnits));
  const c1 = Math.max(0, num(addedUnitCost));
  if (q0 <= 0) return c1;
  if (q1 <= 0) return c0;
  return (q0 * c0 + q1 * c1) / (q0 + q1);
}

/**
 * Combien de lots entiers dans `availableUnits`.
 * Un lot incomplet n'est pas vendable comme lot : on tronque.
 */
export function maxSellable(packaging, availableUnits) {
  const size = num(packaging && packaging.size);
  const stock = Math.max(0, num(availableUnits));
  if (size <= 0) return 0;
  return Math.floor(stock / size);
}

/**
 * Quantité d'une ligne après un +/−, bornée par le stock vendable.
 *
 * L'ordre des bornes compte : plafonner d'abord, remonter à 1 ensuite. Si le
 * stock a fondu depuis l'ajout au panier, `max` peut valoir 0 — l'ordre
 * inverse laisserait une ligne à 0, ni supprimée ni vendable.
 */
export function clampQty(qty, max) {
  return Math.max(1, Math.min(num(max), num(qty)));
}

/**
 * Décompose un stock sur les conditionnements, du plus grand au plus petit :
 * « 2 palettes + 1 carton + 22 ». Ne compte que les lots entiers.
 */
export function decomposeStock(product) {
  const lots = normalizePackagings(product)
    .filter((p) => p.size > 1)
    .sort((a, b) => b.size - a.size);

  const parts = [];
  let reste = num(product && product.qty);
  lots.forEach((p) => {
    const n = Math.floor(reste / p.size);
    if (n > 0) {
      parts.push(`${n} ${p.label}${n > 1 ? 's' : ''}`);
      reste -= n * p.size;
    }
  });
  if (parts.length === 0) return null;
  if (reste > 0) parts.push(String(reste));
  return parts.join(' + ');
}

/** « 862 pièce (2 palettes + 1 carton + 22) » */
export function describeStock(product) {
  const base = `${num(product && product.qty)} ${(product && product.unit) || 'unité'}`;
  const detail = decomposeStock(product);
  return detail ? `${base} (${detail})` : base;
}

/** Total d'une ligne de panier : prix du conditionnement × quantité. */
export function lineTotal(line) {
  return num(line && line.unitPrice) * num(line && line.qty);
}

/** Unités de base consommées par une ligne de panier. */
export function lineUnits(line) {
  return num(line && line.size) * num(line && line.qty);
}
