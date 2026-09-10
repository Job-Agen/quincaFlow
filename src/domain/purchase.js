import { round2, round3, toNumber } from '../utils/money';

/**
 * Commandes fournisseurs (§20-22).
 *
 * Règle centrale : commander un produit ne signifie pas le posséder. Une
 * commande de 50 sacs ne crée aucun mouvement de stock. Le stock n'augmente
 * qu'à la réception effective, à hauteur de ce qui a réellement été livré — ce
 * qui rend la livraison partielle native plutôt que rajoutée après coup.
 */

export const PO_STATUSES = [
  'DRAFT',
  'SENT',
  'INVOICE_RECEIVED',
  'PAID',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

export const PO_STATUS_LABELS = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  INVOICE_RECEIVED: 'Facture reçue',
  PAID: 'Payée',
  PARTIALLY_RECEIVED: 'Partiellement livrée',
  RECEIVED: 'Livrée',
  CANCELLED: 'Annulée',
};

/** Teinte de badge par statut : vert quand c'est livré, ambre tant que ça court. */
export const PO_STATUS_TONES = {
  DRAFT: 'grey',
  SENT: 'blue',
  INVOICE_RECEIVED: 'amber',
  PAID: 'blue',
  PARTIALLY_RECEIVED: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'grey',
};

/** Statuts que le gérant peut poser à la main ; la réception, elle, est déduite. */
export const PO_MANUAL_STATUSES = ['DRAFT', 'SENT', 'INVOICE_RECEIVED', 'PAID', 'CANCELLED'];

export const DOCUMENT_KINDS = {
  PURCHASE_ORDER: 'Bon de commande',
  SUPPLIER_INVOICE: 'Facture fournisseur',
  PAYMENT_PROOF: 'Preuve de paiement',
};

/** Total estimé d'une commande : somme des quantités × coût unitaire. */
export function orderTotal(items) {
  return round2(
    items.reduce((sum, item) => {
      const qty = toNumber(item.quantity_ordered ?? item.quantityOrdered ?? item.quantity);
      const cost = toNumber(item.unit_cost ?? item.unitCost);
      return sum + qty * cost;
    }, 0)
  );
}

/** Reste à livrer sur une ligne, jamais négatif. */
export function remainingOf(item) {
  const ordered = toNumber(item.quantity_ordered ?? item.quantityOrdered);
  const received = toNumber(item.quantity_received ?? item.quantityReceived);
  return round3(Math.max(0, ordered - received));
}

/**
 * Statut de réception déduit des lignes.
 *
 * Il n'est jamais saisi : le calculer à partir des quantités évite qu'une
 * commande soit marquée « livrée » alors qu'il reste 20 sacs à recevoir.
 * Une commande payée mais non encore livrée conserve son statut administratif.
 */
export function receptionStatus(items, currentStatus) {
  if (currentStatus === 'CANCELLED') return 'CANCELLED';
  const totalOrdered = items.reduce(
    (sum, item) => sum + toNumber(item.quantity_ordered ?? item.quantityOrdered),
    0
  );
  const totalReceived = items.reduce(
    (sum, item) => sum + toNumber(item.quantity_received ?? item.quantityReceived),
    0
  );
  if (totalOrdered > 0 && totalReceived >= totalOrdered) return 'RECEIVED';
  if (totalReceived > 0) return 'PARTIALLY_RECEIVED';
  return currentStatus;
}

/** Une commande n'accepte plus de réception une fois annulée ou soldée. */
export function canReceive(order, items) {
  if (order.status === 'CANCELLED') return false;
  return items.some((item) => remainingOf(item) > 0);
}
