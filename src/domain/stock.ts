import type { ProductRow, StockMovementType } from '@/types';

/**
 * Types de mouvement de stock (§26).
 *
 * `products.stock_quantity` n'est qu'un cache de lecture : ce journal est ce qui
 * permet de répondre à « pourquoi le stock est-il passé de 50 à 37 ? ». Les
 * quantités y sont signées et exprimées en unité de base.
 */
export const MOVEMENT_TYPES: readonly StockMovementType[] = [
  'SALE',
  'SALE_CANCEL',
  'PURCHASE_RECEIPT',
  'RETURN',
  'ADJUSTMENT',
];

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  SALE: 'Vente',
  SALE_CANCEL: 'Annulation de vente',
  PURCHASE_RECEIPT: 'Réception fournisseur',
  RETURN: 'Retour',
  ADJUSTMENT: 'Ajustement',
};

export const ADJUSTMENT_REASONS: readonly string[] = [
  'Inventaire',
  'Casse',
  'Perte',
  'Vol',
  'Erreur de saisie',
  'Autre',
];

/** Un produit est en alerte dès que son stock atteint son seuil. */
export function isLowStock(
  product: Pick<ProductRow, 'stock_quantity' | 'low_stock_threshold'>
): boolean {
  const qty = Number(product.stock_quantity ?? 0);
  const threshold = Number(product.low_stock_threshold ?? 0);
  return threshold > 0 && qty <= threshold;
}

export function isOutOfStock(product: Pick<ProductRow, 'stock_quantity'>): boolean {
  return Number(product.stock_quantity ?? 0) <= 0;
}
