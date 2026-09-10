import { round2, toNumber } from '../utils/money';

/**
 * Vente hors stock (§16-17).
 *
 * La quincaillerie vend un produit qu'elle n'a pas : elle le récupère chez un
 * confrère, encaisse le client, paie le confrère, et garde la différence. Le
 * produit ne transite jamais par le stock — il n'a été acquis que pour cette
 * commande précise. Aucun mouvement de stock n'est donc créé, et le compteur de
 * stock normal reste intact.
 */

export const OOS_STATUSES = [
  'TO_SOURCE',
  'SOURCED',
  'CUSTOMER_PAID',
  'SELLER_PAID',
  'COMPLETED',
  'CANCELLED',
];

export const OOS_STATUS_LABELS = {
  TO_SOURCE: 'À récupérer',
  SOURCED: 'Produit récupéré',
  CUSTOMER_PAID: 'Client payé',
  SELLER_PAID: 'Vendeur payé',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulée',
};

/** Étapes affichées dans l'ordre du workflow, hors annulation. */
export const OOS_FLOW = ['TO_SOURCE', 'SOURCED', 'CUSTOMER_PAID', 'SELLER_PAID', 'COMPLETED'];

/** Position d'un statut dans le flux ; -1 pour une opération annulée. */
export function flowIndex(status) {
  return OOS_FLOW.indexOf(status);
}

/**
 * Une opération avance d'une étape à la fois, ou est annulée. Sauter de
 * « à récupérer » à « terminé » masquerait qu'aucun paiement n'a été constaté.
 */
export function canTransition(from, to) {
  if (from === 'COMPLETED' || from === 'CANCELLED') return false;
  if (to === 'CANCELLED') return true;
  const current = flowIndex(from);
  return current >= 0 && flowIndex(to) === current + 1;
}

/** Marge brute de l'opération : ce que paie le client moins ce que coûte le confrère. */
export function marginOf({ quantity, costPrice, sellingPrice }) {
  const qty = Math.max(0, toNumber(quantity, 1)) || 1;
  return round2(qty * (toNumber(sellingPrice) - toNumber(costPrice)));
}
