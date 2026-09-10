import { round2, round3, toNumber } from '../utils/money';

/**
 * Unités et conditionnements (§10).
 *
 * Un produit n'a qu'un seul stock, compté dans son unité de base. Un carton
 * n'est pas un second stock : c'est un facteur de conversion et un prix. Vendre
 * 1 carton de 40 retire 40 pièces du stock unique, ce qui gère naturellement les
 * cartons entamés et évite d'avoir à réconcilier un « stock carton » avec un
 * « stock pièce » qui finiraient par se contredire.
 */

/** Unité de base implicite d'un produit qui n'a pas encore de conditionnement. */
export function baseUnitOf(product) {
  return (product && (product.base_unit || product.baseUnit)) || 'pièce';
}

/**
 * Conditionnements d'un produit, normalisés et triés du plus petit au plus grand.
 * Il y en a toujours au moins un : l'unité de base, au prix de vente du produit.
 */
export function unitsOf(product, rows) {
  const label = baseUnitOf(product);
  const base = {
    id: `${product?.id || 'base'}:base`,
    label,
    factor: 1,
    price: round2(product?.selling_price ?? product?.sellingPrice),
    isBase: true,
  };

  if (!Array.isArray(rows) || rows.length === 0) return [base];

  const mapped = rows
    .map((row) => ({
      id: row.id,
      label: (row.label || '').trim() || label,
      factor: round3(row.factor),
      price: round2(row.price),
      isBase: Boolean(row.is_base ?? row.isBase),
    }))
    .filter((unit) => unit.factor > 0);

  // L'unité de base doit exister même si la table ne la porte pas explicitement.
  if (!mapped.some((unit) => unit.factor === 1)) mapped.push(base);

  return mapped.sort((a, b) => a.factor - b.factor);
}

/** Retrouve un conditionnement par son id, avec repli sur l'unité de base. */
export function findUnit(units, unitId) {
  return units.find((unit) => unit.id === unitId) || units.find((u) => u.factor === 1) || units[0];
}

/** Unités de base consommées par `quantity` conditionnements. */
export function toBaseQuantity(unit, quantity) {
  return round3(toNumber(unit?.factor, 1) * toNumber(quantity));
}

/**
 * Prix ramené à l'unité de base — la seule grandeur qui permette de comparer un
 * tarif au détail et un tarif en gros.
 */
export function pricePerBaseUnit(unit) {
  const factor = toNumber(unit?.factor, 0);
  if (factor <= 0) return 0;
  return round2(toNumber(unit.price) / factor);
}

/**
 * Coût d'achat ramené à l'unité de base.
 *
 * On achète au carton et on revend à la pièce : un carton de 40 payé 12 750
 * revient à 318,75 la pièce. Conserver 12 750 tel quel afficherait une marge de
 * −96 % et surévaluerait le stock d'un facteur égal au conditionnement.
 */
export function costPerBaseUnit(paidPrice, unit) {
  const factor = toNumber(unit?.factor, 1);
  const paid = toNumber(paidPrice);
  if (factor <= 0) return round2(paid);
  return round2(paid / factor);
}

/**
 * Coût moyen pondéré après réapprovisionnement.
 *
 * Réassortir 400 pièces à 320 quand on en détient 100 à 300 ne donne pas 320
 * mais (100×300 + 400×320) / 500 = 316. Sans cette pondération, les marges
 * sauteraient à chaque achat au prix du jour.
 */
export function weightedAverageCost(currentQty, currentCost, addedQty, addedCost) {
  const q0 = Math.max(0, toNumber(currentQty));
  const c0 = Math.max(0, toNumber(currentCost));
  const q1 = Math.max(0, toNumber(addedQty));
  const c1 = Math.max(0, toNumber(addedCost));
  if (q1 <= 0) return round2(c0);
  if (q0 <= 0) return round2(c1);
  return round2((q0 * c0 + q1 * c1) / (q0 + q1));
}

/** Combien de conditionnements entiers tiennent dans le stock disponible. */
export function maxSellable(unit, availableBaseQty) {
  const factor = toNumber(unit?.factor, 0);
  const stock = Math.max(0, toNumber(availableBaseQty));
  if (factor <= 0) return 0;
  return Math.floor(stock / factor);
}

/**
 * Décompose un stock sur les conditionnements, du plus grand au plus petit :
 * « 2 cartons + 22 ». Ne compte que les lots entiers.
 */
export function describeStock(baseQty, units, baseLabel) {
  const qty = Math.max(0, toNumber(baseQty));
  const lots = units.filter((unit) => unit.factor > 1).sort((a, b) => b.factor - a.factor);

  const parts = [];
  let left = qty;
  lots.forEach((unit) => {
    const count = Math.floor(left / unit.factor);
    if (count > 0) {
      parts.push(`${count} ${unit.label}${count > 1 ? 's' : ''}`);
      left = round3(left - count * unit.factor);
    }
  });

  const base = `${qty} ${baseLabel}`;
  if (parts.length === 0) return base;
  if (left > 0) parts.push(String(left));
  return `${base} (${parts.join(' + ')})`;
}
