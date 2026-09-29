import { round2, round3, toNumber } from '../utils/money';
import type {
  Money,
  PurchaseOrderItemRow,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  Quantity,
  Tone,
} from '@/types';

/**
 * Deux formes de ligne coexistent, et les distinguer est tout l'intérêt du
 * typage ici :
 *
 * — `OrderLineDraft` est une ligne **en cours de saisie**, côté écran comme côté
 *   serveur avant écriture. Elle est en `camelCase` et ne connaît qu'une
 *   quantité commandée ;
 * — `ReceivedLine` est une ligne **déjà enregistrée**, relue de Postgres en
 *   `snake_case`, qui porte en plus ce qui a été reçu.
 *
 * Ces fonctions acceptaient auparavant les deux orthographes par une cascade de
 * `??`. Une ligne mal nommée y passait donc en silence et donnait un total de
 * zéro au lieu d'une erreur.
 */
export interface OrderLineDraft {
  /** Chaîne acceptée : un champ de formulaire en cours de frappe en envoie une. */
  quantity: Quantity | string;
  unitCost: Money | string;
}

type ReceivedLine = Pick<PurchaseOrderItemRow, 'quantity_ordered' | 'quantity_received'>;

/**
 * Commandes fournisseurs (§20-22).
 *
 * Règle centrale : commander un produit ne signifie pas le posséder. Une
 * commande de 50 sacs ne crée aucun mouvement de stock. Le stock n'augmente
 * qu'à la réception effective, à hauteur de ce qui a réellement été livré — ce
 * qui rend la livraison partielle native plutôt que rajoutée après coup.
 */

export const PO_STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'SENT',
  'INVOICE_RECEIVED',
  'PAID',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  INVOICE_RECEIVED: 'Facture reçue',
  PAID: 'Payée',
  PARTIALLY_RECEIVED: 'Partiellement livrée',
  RECEIVED: 'Livrée',
  CANCELLED: 'Annulée',
};

/** Teinte de badge par statut : vert quand c'est livré, ambre tant que ça court. */
export const PO_STATUS_TONES: Record<PurchaseOrderStatus, Tone> = {
  DRAFT: 'grey',
  SENT: 'blue',
  INVOICE_RECEIVED: 'amber',
  PAID: 'blue',
  PARTIALLY_RECEIVED: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'grey',
};

/** Statuts que le gérant peut poser à la main ; la réception, elle, est déduite. */
export const PO_MANUAL_STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'SENT',
  'INVOICE_RECEIVED',
  'PAID',
  'CANCELLED',
];

export const DOCUMENT_KINDS = {
  PURCHASE_ORDER: 'Bon de commande',
  SUPPLIER_INVOICE: 'Facture fournisseur',
  PAYMENT_PROOF: 'Preuve de paiement',
};

/** Total estimé d'une commande : somme des quantités × coût unitaire. */
export function orderTotal(items: OrderLineDraft[]): Money {
  return round2(
    items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitCost), 0)
  );
}

/** Reste à livrer sur une ligne, jamais négatif. */
export function remainingOf(item: ReceivedLine): Quantity {
  const ordered = toNumber(item.quantity_ordered);
  const received = toNumber(item.quantity_received);
  return round3(Math.max(0, ordered - received));
}

/**
 * Statut de réception déduit des lignes.
 *
 * Il n'est jamais saisi : le calculer à partir des quantités évite qu'une
 * commande soit marquée « livrée » alors qu'il reste 20 sacs à recevoir.
 * Une commande payée mais non encore livrée conserve son statut administratif.
 */
export function receptionStatus(
  items: ReceivedLine[],
  currentStatus: PurchaseOrderStatus
): PurchaseOrderStatus {
  if (currentStatus === 'CANCELLED') return 'CANCELLED';
  const totalOrdered = items.reduce((sum, item) => sum + toNumber(item.quantity_ordered), 0);
  const totalReceived = items.reduce((sum, item) => sum + toNumber(item.quantity_received), 0);
  if (totalOrdered > 0 && totalReceived >= totalOrdered) return 'RECEIVED';
  if (totalReceived > 0) return 'PARTIALLY_RECEIVED';
  return currentStatus;
}

/** Une commande n'accepte plus de réception une fois annulée ou soldée. */
export function canReceive(
  order: Pick<PurchaseOrderRow, 'status'>,
  items: ReceivedLine[]
): boolean {
  if (order.status === 'CANCELLED') return false;
  return items.some((item) => remainingOf(item) > 0);
}
