/**
 * Conditionnements multiples.
 *
 * Un article se vend dans plusieurs unités — la pièce, le carton, le sac, la
 * palette — mais son stock n'est compté que dans une seule : l'unité de base.
 * Chaque conditionnement dit simplement combien d'unités de base il contient
 * et à quel prix il part. Vendre une palette de 400 retire 400 pièces du même
 * stock, ce qui gère naturellement les cartons et palettes entamés.
 *
 * Sur un article :
 *   unit         unité de base, ex. « pièce »
 *   qty          stock, en unités de base
 *   buyPrice     coût moyen pondéré, par unité de base
 *   packagings   [{ id, label, size, price, isDefault }]
 *                  size  = unités de base contenues (1 pour l'unité de base)
 *                  price = prix de vente du conditionnement entier
 *
 * Les articles créés avant cette évolution portaient un seul conditionnement,
 * à plat (packLabel / packSize / packPrice). normalizePackagings les convertit
 * a la volee : rien n'est perdu et aucune migration de donnees n'est requise.
 */

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Une ligne vendue à l'unité de base est du détail ; au-delà, c'est du gros. */
export const RETAIL = 'détail';
export const WHOLESALE = 'gros';

export function modeOf(packaging) {
  return num(packaging && packaging.size) > 1 ? WHOLESALE : RETAIL;
}

let seq = 0;
function makeId() {
  // crypto.randomUUID n'existe pas partout (jsdom des tests, vieux Safari)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  seq += 1;
  return `pkg_${Date.now()}_${seq}`;
}

/** Conditionnement neuf, prêt à être édité. */
export function blankPackaging(label = '', size = '', price = '') {
  return { id: makeId(), label, size, price, isDefault: false };
}

/**
 * Liste normalisée des conditionnements d'un article, du plus petit au plus
 * grand. Toujours au moins un : l'unité de base.
 *
 * Accepte les trois formes rencontrées :
 *   - `packagings` déjà présent (format courant) ;
 *   - `packLabel`/`packSize`/`packPrice` (ancien format, un seul carton) ;
 *   - ni l'un ni l'autre : l'article ne se vend qu'à l'unité de base.
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
        isDefault: !!p.isDefault,
      }))
      .filter((p) => p.size > 0)
      .sort((a, b) => a.size - b.size);
  }

  // Ancien format : l'unité de base au prix de détail, plus le carton s'il existe.
  const list = [
    {
      id: 'base',
      label: baseUnit,
      size: 1,
      price: num(product.sellPrice),
      isDefault: true,
    },
  ];
  if (num(product.packSize) > 0 && num(product.packPrice) > 0) {
    list.push({
      id: 'legacy-pack',
      label: (product.packLabel || 'carton').trim(),
      size: num(product.packSize),
      price: num(product.packPrice),
      isDefault: false,
    });
  }
  return list;
}

/** Le conditionnement proposé en premier : celui marqué par défaut, sinon le plus petit. */
export function defaultPackaging(product) {
  const list = normalizePackagings(product);
  return list.find((p) => p.isDefault) || list[0] || null;
}

/** Un article vend en gros dès qu'un conditionnement dépasse l'unité de base. */
export function hasBulk(product) {
  return normalizePackagings(product).some((p) => p.size > 1);
}

/** Unités de base retirées du stock pour `qty` conditionnements. */
export function unitsOf(packaging, qty) {
  return num(packaging && packaging.size) * num(qty);
}

/** Prix ramené à l'unité de base — seul moyen de comparer deux conditionnements. */
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
 * Remise d'un conditionnement par rapport au prix à l'unité de base.
 * Négative si le lot revient plus cher que le détail — une saisie à revoir.
 */
export function discountOf(packaging, product) {
  const list = normalizePackagings(product);
  const base = list.find((p) => p.size === 1);
  const ref = base ? num(base.price) : 0;
  const perUnit = unitPriceOf(packaging);
  if (ref <= 0 || perUnit === null) return null;
  return ((ref - perUnit) / ref) * 100;
}

/** Combien de `packaging` entiers dans `availableUnits` — les lots incomplets ne comptent pas. */
export function maxSellable(packaging, availableUnits) {
  const size = num(packaging && packaging.size);
  const stock = Math.max(0, num(availableUnits));
  if (size <= 0) return 0;
  return Math.floor(stock / size);
}

/**
 * Décompose un stock sur les conditionnements, du plus grand au plus petit :
 * « 2 palettes + 1 carton + 22 ». Ne garde que ce qui est entier.
 */
export function decomposeStock(product) {
  const stock = num(product && product.qty);
  const list = normalizePackagings(product)
    .filter((p) => p.size > 1)
    .sort((a, b) => b.size - a.size);

  const parts = [];
  let reste = stock;
  list.forEach((p) => {
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

/** « 862 pièces (2 palettes + 1 carton + 22) » */
export function describeStock(product) {
  const stock = num(product && product.qty);
  const base = `${stock} ${(product && product.unit) || 'unité'}`;
  const detail = decomposeStock(product);
  return detail ? `${base} (${detail})` : base;
}

/**
 * Coût moyen pondéré après un réapprovisionnement.
 *
 * Réassortir 400 pièces à 320 quand on en détient 100 à 300 ne donne pas 320 :
 * la valeur du stock est (100×300 + 400×320) / 500 = 316. Sans cette pondération,
 * les marges se décalent à chaque achat au prix du jour.
 */
export function weightedAverageCost(currentUnits, currentCost, addedUnits, addedUnitCost) {
  const q0 = Math.max(0, num(currentUnits));
  const c0 = Math.max(0, num(currentCost));
  const q1 = Math.max(0, num(addedUnits));
  const c1 = Math.max(0, num(addedUnitCost));
  const total = q0 + q1;
  if (total <= 0) return c1;
  if (q0 <= 0) return c1;
  if (q1 <= 0) return c0;
  return (q0 * c0 + q1 * c1) / total;
}

/** Quantité d'une ligne après un +/−, bornée par le stock vendable. */
export function clampQty(qty, max) {
  return Math.max(1, Math.min(num(max), num(qty)));
}

/** Total d'une ligne de panier : le prix du conditionnement × la quantité. */
export function lineTotal(line) {
  return num(line && line.unitPrice) * num(line && line.qty);
}

/** Unités de base consommées par une ligne de panier. */
export function lineUnits(line) {
  return num(line && line.size) * num(line && line.qty);
}
