/**
 * Types de mouvement de stock (§26).
 *
 * `products.stock_quantity` n'est qu'un cache de lecture : ce journal est ce qui
 * permet de répondre à « pourquoi le stock est-il passé de 50 à 37 ? ». Les
 * quantités y sont signées et exprimées en unité de base.
 */
export const MOVEMENT_TYPES = ['SALE', 'SALE_CANCEL', 'PURCHASE_RECEIPT', 'RETURN', 'ADJUSTMENT'];

export const MOVEMENT_LABELS = {
  SALE: 'Vente',
  SALE_CANCEL: 'Annulation de vente',
  PURCHASE_RECEIPT: 'Réception fournisseur',
  RETURN: 'Retour',
  ADJUSTMENT: 'Ajustement',
};

export const ADJUSTMENT_REASONS = [
  'Inventaire',
  'Casse',
  'Perte',
  'Vol',
  'Erreur de saisie',
  'Autre',
];

/** Un produit est en alerte dès que son stock atteint son seuil. */
export function isLowStock(product) {
  const qty = Number(product.stock_quantity ?? product.stockQuantity ?? 0);
  const threshold = Number(product.low_stock_threshold ?? product.lowStockThreshold ?? 0);
  return threshold > 0 && qty <= threshold;
}

export function isOutOfStock(product) {
  return Number(product.stock_quantity ?? product.stockQuantity ?? 0) <= 0;
}
