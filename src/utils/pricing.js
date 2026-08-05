/**
 * Vente en gros et au détail.
 *
 * Le stock d'un article est toujours compté dans son unité de base (la pièce).
 * La vente en gros n'est pas un stock séparé : c'est un conditionnement.
 * Un carton de 40 lames, ce sont 40 pièces du même stock — vendre un carton
 * retire donc 40 pièces, ce qui gère naturellement les cartons entamés
 * (100 pièces = 2 cartons + 20 pièces).
 *
 * Champs concernés sur un article :
 *   unit       unité de base, ex. « pièce »
 *   sellPrice  prix de détail, pour UNE unité de base
 *   qty        stock, en unités de base
 *   packLabel  nom du conditionnement, ex. « carton »
 *   packSize   nombre d'unités de base par conditionnement, ex. 40
 *   packPrice  prix de gros, pour UN conditionnement entier
 */

export const RETAIL = 'détail';
export const WHOLESALE = 'gros';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Un article se vend en gros dès qu'il a un conditionnement et un prix. */
export function hasWholesale(product) {
  if (!product) return false;
  return num(product.packSize) > 0 && num(product.packPrice) > 0;
}

/** Nom du conditionnement, avec repli sur « carton ». */
export function packLabelOf(product) {
  return (product && product.packLabel) || 'carton';
}

/** Libellé de l'unité vendue dans ce mode : « pièce » ou « carton ». */
export function unitLabel(product, mode) {
  if (mode === WHOLESALE) return packLabelOf(product);
  return (product && product.unit) || 'unité';
}

/** Prix d'une unité vendue : la pièce en détail, le carton entier en gros. */
export function priceFor(product, mode) {
  if (!product) return 0;
  return mode === WHOLESALE ? num(product.packPrice) : num(product.sellPrice);
}

/** Unités de base retirées du stock pour `qty` unités vendues dans ce mode. */
export function unitsFor(product, mode, qty) {
  const q = num(qty);
  if (mode !== WHOLESALE) return q;
  return q * num(product && product.packSize);
}

/**
 * Prix de gros ramené à la pièce. Sert à comparer les deux tarifs et à
 * calculer la marge réelle d'une vente en gros.
 */
export function packUnitPrice(product) {
  if (!hasWholesale(product)) return null;
  return num(product.packPrice) / num(product.packSize);
}

/**
 * Remise du gros par rapport au détail, en pourcentage.
 * Négative si le carton revient plus cher que la pièce — une saisie à revoir.
 */
export function wholesaleDiscount(product) {
  const retail = num(product && product.sellPrice);
  const perUnit = packUnitPrice(product);
  if (perUnit === null || retail <= 0) return null;
  return ((retail - perUnit) / retail) * 100;
}

/** Marge du gros, calculée pièce par pièce contre le prix d'achat. */
export function wholesaleMargin(product) {
  const buy = num(product && product.buyPrice);
  const perUnit = packUnitPrice(product);
  if (perUnit === null || buy <= 0) return null;
  return ((perUnit - buy) / buy) * 100;
}

/**
 * Combien d'unités vendables dans ce mode, pour `availableUnits` en stock.
 * En gros, un carton incomplet n'est pas vendable : on tronque.
 */
export function maxSellable(product, mode, availableUnits) {
  const stock = Math.max(0, num(availableUnits));
  if (mode !== WHOLESALE) return stock;
  const size = num(product && product.packSize);
  if (size <= 0) return 0;
  return Math.floor(stock / size);
}

/**
 * Découpe un stock en cartons entiers et reste : « 2 cartons + 20 ».
 * Vaut null quand il n'y a pas de quoi faire un carton, ou pas de
 * conditionnement du tout.
 */
export function packBreakdown(product) {
  if (!hasWholesale(product)) return null;
  const stock = num(product.qty);
  const size = num(product.packSize);
  const packs = Math.floor(stock / size);
  if (packs === 0) return null;
  const rest = stock % size;
  const label = packLabelOf(product) + (packs > 1 ? 's' : '');
  return rest === 0 ? `${packs} ${label}` : `${packs} ${label} + ${rest}`;
}

/**
 * Décrit un stock en pièces sous forme lisible : « 100 pièces (2 cartons + 20) ».
 * Sans conditionnement, seule l'unité de base est mentionnée.
 */
export function describeStock(product) {
  const stock = num(product && product.qty);
  const base = `${stock} ${unitLabel(product, RETAIL)}`;
  const breakdown = packBreakdown(product);
  return breakdown ? `${base} (${breakdown})` : base;
}

/**
 * Total d'une ligne de panier : le prix unitaire du mode × la quantité.
 * Un carton se compte comme une unité vendue, pas comme packSize pièces.
 */
export function lineTotal(line) {
  return num(line && line.unitPrice) * num(line && line.qty);
}

/**
 * Prix d'achat ramené à l'unité de base.
 *
 * Beaucoup d'articles s'achètent au carton et se revendent à la pièce : un
 * carton de 40 lames payé 12 750 revient à 318,75 la lame. Le stock étant
 * valorisé à l'unité, c'est ce prix-là qu'il faut conserver — saisir le prix
 * du carton tel quel donnerait des marges négatives et un stock surévalué
 * d'un facteur packSize.
 *
 * `mode` vaut PER_UNIT ou PER_PACK. Sans conditionnement connu, on ne peut
 * pas diviser : la valeur est rendue telle quelle.
 */
export const PER_UNIT = 'unit';
export const PER_PACK = 'pack';

export function unitBuyPrice(value, mode, packSize) {
  const v = num(value);
  const size = num(packSize);
  if (mode !== PER_PACK || size <= 0) return v;
  return v / size;
}

/**
 * Nouvelle quantité d'une ligne après un +/−, bornée par le stock vendable.
 *
 * L'ordre des bornes compte : plafonner d'abord puis remonter à 1, jamais
 * l'inverse. Si le stock a fondu depuis l'ajout au panier (inventaire passé
 * ailleurs), `max` peut valoir 0 — plafonner en dernier laisserait alors une
 * ligne à 0, ni supprimée ni vendable.
 */
export function clampQty(qty, max) {
  return Math.max(1, Math.min(num(max), num(qty)));
}

/** Unités de base consommées par une ligne de panier déjà constituée. */
export function lineUnits(line) {
  if (!line) return 0;
  return line.mode === WHOLESALE
    ? num(line.qty) * num(line.packSize)
    : num(line.qty);
}
