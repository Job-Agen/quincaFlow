import { amount, money, shortDate, withUnit } from '../utils/format';
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

// ---------------------------------------------------------------------------
// Bon de commande : document et message (§43)
// ---------------------------------------------------------------------------

/** Identité de la boutique, telle qu'elle figure en tête d'un document. */
export interface OrderDocumentBusiness {
  name?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
}

/**
 * Une ligne réduite à ce dont le message a besoin.
 *
 * Ni `OrderLineDraft` ni `PurchaseOrderItemRow` ne conviennent : la première
 * ignore le nom du produit, la seconde n'existe qu'après enregistrement, et le
 * message doit pouvoir partir d'une commande encore à l'écran.
 */
export interface OrderMessageLine {
  productName: string;
  unitLabel?: string | null;
  quantity: Quantity | string;
  unitCost?: Money | string | null;
}

/** L'en-tête de la commande : ce qui ne vient pas des lignes. */
export interface OrderMessageHead {
  reference?: string | null;
  supplierName?: string | null;
  createdAt?: string | number | Date | null;
  notes?: string | null;
  cancelled?: boolean;
}

/**
 * Le bon de commande en texte, prêt pour une conversation WhatsApp (§43).
 *
 * Une seule fonction pour les trois endroits qui en envoyaient trois versions
 * différentes : la saisie, le détail de la commande, et l'écran natif qui n'en
 * envoyait aucune.
 *
 * Les astérisques sont la mise en gras de WhatsApp, pas de la décoration : le
 * message arrive en gras chez le fournisseur. Aucune colonne n'est alignée à
 * l'espace — la police de WhatsApp est proportionnelle, et un tableau ASCII y
 * arrive de travers.
 *
 * **Une commande sans prix est une demande de prix.** Le gérant qui ne connaît
 * pas encore le tarif laisse les coûts à zéro ; le message devient alors une
 * demande de cotation, sans total — car annoncer « 0 FCFA » serait faux — et la
 * clôture demande un prix au lieu de le confirmer.
 */
/**
 * Le titre dit ce que le document est, et un bon sans prix n'est pas un bon.
 *
 * Annoncer « BON DE COMMANDE » puis demander les prix met le fournisseur devant
 * deux lectures contradictoires : il peut y voir un engagement sur des tarifs
 * qu'il n'a pas encore donnés.
 *
 * Exporté parce que le document imprimé porte le même titre que le message : le
 * dédoubler ferait partir un « bon de commande » sur papier et une « demande de
 * prix » sur WhatsApp pour la même commande.
 */
export function purchaseOrderHeading(priced: boolean): string {
  return priced ? 'BON DE COMMANDE' : 'DEMANDE DE PRIX';
}

function titre(priced: boolean, reference?: string | null): string {
  const nom = purchaseOrderHeading(priced);
  return reference ? `*${nom} N° ${reference}*` : `*${nom} (projet)*`;
}

/**
 * Les lignes d'une commande enregistrée, dans la forme attendue par le message.
 *
 * La conversion vivait aux deux appels, chacun avec son propre oubli : l'un
 * laissait tomber le coût unitaire, l'autre l'unité.
 */
export function orderMessageLines(
  items: readonly PurchaseOrderItemRow[]
): readonly OrderMessageLine[] {
  return items.map((item) => ({
    productName: item.product_name,
    unitLabel: item.unit_label,
    quantity: item.quantity_ordered,
    unitCost: item.unit_cost,
  }));
}

/** La phrase de clôture : ce qu'on attend du fournisseur, et rien d'autre. */
function cloture(cancelled: boolean, priced: boolean): string {
  // Demander un délai de livraison sous un bandeau « ANNULÉE » annulerait
  // l'annulation dans la tête de celui qui lit.
  if (cancelled) return 'Merci de ne pas donner suite à cette commande.';
  return priced
    ? 'Merci de nous confirmer la disponibilité, le délai de livraison et le prix définitif.'
    : 'Merci de nous communiquer vos prix et vos délais pour ces articles.';
}

export function purchaseOrderMessage(
  order: OrderMessageHead,
  lines: readonly OrderMessageLine[],
  business?: OrderDocumentBusiness | null,
  currency = 'FCFA'
): string {
  const total = orderTotal(
    lines.map((line) => ({ quantity: line.quantity, unitCost: line.unitCost ?? 0 }))
  );
  const priced = total > 0;

  const shop = (business?.name || '').trim();
  const phone = (business?.phone || '').trim();
  const signature = [shop, phone ? `Tél : ${phone}` : ''].filter(Boolean).join(' — ');

  return [
    // L'avertissement ouvre le message : c'est lui qu'on lit avant de livrer.
    order.cancelled ? '⚠️ *COMMANDE ANNULÉE* — ce bon ne vaut plus commande.\n' : '',
    shop ? `*${shop.toUpperCase()}*` : '',
    (business?.tagline || '').trim(),
    (business?.address || '').trim(),
    phone ? `Tél : ${phone}` : '',
    '',
    titre(priced, order.reference),
    `Date : ${shortDate(order.createdAt ?? new Date())}`,
    order.supplierName ? `Fournisseur : ${order.supplierName}` : '',
    '',
    ...lines.map((line, index) => {
      const quantities = withUnit(line.quantity, line.unitLabel);
      const cost = toNumber(line.unitCost ?? 0);
      const detail =
        cost > 0
          ? `${quantities} × ${amount(cost)} = ${money(round2(toNumber(line.quantity) * cost), currency)}`
          : quantities;
      return `${index + 1}. ${line.productName}\n   ${detail}`;
    }),
    '',
    priced ? `*TOTAL ESTIMÉ : ${money(total, currency)}*` : '',
    order.notes ? `\nObservations : ${order.notes.trim()}` : '',
    '',
    cloture(order.cancelled === true, priced),
    signature ? `\n${signature}` : '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
