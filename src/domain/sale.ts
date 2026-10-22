import { round2, round3, toNumber } from '../utils/money';
import type {
  MobileMoneyProvider,
  Money,
  PaymentMethod,
  PaymentStatus,
  PricedLine,
  ProductRow,
  Quantity,
  SaleLineInput,
  SaleStatus,
  SaleTotals,
  Unit,
} from '@/types';
import { findUnit, toBaseQuantity } from './units';

/**
 * Calculs d'une vente (§13).
 *
 * Ces fonctions sont pures et partagées : le panier les utilise pour afficher un
 * total instantané, l'API les rejoue avant d'écrire. Le frontend n'est jamais la
 * source de vérité financière (§35) — il n'envoie que des identifiants et des
 * quantités, jamais un total que le serveur reprendrait tel quel.
 */

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'MOBILE_MONEY',
  'CARD',
  'BANK',
  'OTHER',
];
export const PAYMENT_STATUSES: readonly PaymentStatus[] = ['PAID', 'PARTIAL', 'UNPAID'];
export const SALE_STATUSES: readonly SaleStatus[] = ['COMPLETED', 'CANCELLED'];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte bancaire',
  BANK: 'Virement / banque',
  OTHER: 'Autre',
};

export const MOBILE_MONEY_PROVIDERS: readonly MobileMoneyProvider[] = [
  'TMONEY',
  'FLOOZ',
  'ORANGE',
  'MTN',
  'WAVE',
  'OTHER',
];

export const MOBILE_MONEY_PROVIDER_LABELS: Record<MobileMoneyProvider, string> = {
  TMONEY: 'T-Money',
  FLOOZ: 'Flooz',
  ORANGE: 'Orange Money',
  MTN: 'MTN MoMo',
  WAVE: 'Wave',
  OTHER: 'Autre',
};

/**
 * Le moyen de paiement, tel qu'il se lit (§50).
 *
 * L'opérateur ne s'affiche que derrière un paiement Mobile Money : collé à des
 * espèces, il ferait croire à un virement qui n'a pas eu lieu. Les anciennes
 * lignes, saisies avant que l'opérateur existe, n'en portent pas et se lisent
 * comme avant.
 */
export function paymentLabel(
  method: PaymentMethod,
  provider?: MobileMoneyProvider | null
): string {
  const base = PAYMENT_METHOD_LABELS[method] ?? 'Encaissement';
  if (method !== 'MOBILE_MONEY' || !provider) return base;
  const operateur = MOBILE_MONEY_PROVIDER_LABELS[provider];
  return operateur ? `${base} · ${operateur}` : base;
}

/** L'opérateur retenu pour un encaissement : rien hors Mobile Money (§50). */
export function providerFor(
  method: PaymentMethod,
  provider: MobileMoneyProvider | null | undefined
): MobileMoneyProvider | null {
  return method === 'MOBILE_MONEY' ? (provider ?? null) : null;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: 'Payée',
  PARTIAL: 'Partielle',
  UNPAID: 'Impayée',
};

/**
 * Développe une ligne de panier en ligne de vente chiffrée.
 *
 * `entry.unitPrice` permet au vendeur de négocier ; en son absence on retombe
 * sur le tarif du conditionnement. Le coût, lui, n'est jamais négociable : il
 * vient du prix d'achat moyen du produit, ramené au conditionnement vendu.
 */
export function buildSaleLine(
  entry: Pick<SaleLineInput, 'unitId' | 'quantity' | 'unitPrice'>,
  product: Pick<ProductRow, 'id' | 'name' | 'base_unit' | 'purchase_price' | 'selling_price'>,
  units: Unit[]
): PricedLine {
  const unit = findUnit(units, entry.unitId);
  const quantity = round3(entry.quantity);
  const unitPrice =
    entry.unitPrice === undefined || entry.unitPrice === null || entry.unitPrice === ''
      ? round2(unit.price)
      : round2(entry.unitPrice);

  const baseQuantity = toBaseQuantity(unit, quantity);
  const unitCost = round2(toNumber(product.purchase_price) * unit.factor);

  return {
    productId: product.id,
    productName: product.name,
    unitLabel: unit.label,
    unitFactor: unit.factor,
    quantity,
    unitPrice,
    lineTotal: round2(quantity * unitPrice),
    unitCost,
    baseQuantity,
    lineCost: round2(quantity * unitCost),
  };
}

/**
 * Totaux d'une vente.
 *
 * La remise s'applique au sous-total et ne peut pas le dépasser : une vente à
 * total négatif n'a pas de sens et fausserait le chiffre d'affaires du jour.
 */
export function totalsOf(
  lines: Pick<PricedLine, 'lineTotal' | 'lineCost'>[],
  discount: unknown = 0
): SaleTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const applied = Math.min(Math.max(0, round2(discount)), subtotal);
  return {
    subtotal,
    discount: applied,
    total: round2(subtotal - applied),
    costOfGoods: round2(lines.reduce((sum, line) => sum + line.lineCost, 0)),
  };
}

/**
 * Marge brute = ventes − coût des marchandises vendues.
 *
 * Ce n'est pas le bénéfice net : transport, salaires, loyer et pertes ne sont
 * pas déduits (§13). L'interface doit dire « marge brute estimée », jamais
 * « bénéfice ».
 */
export function grossMargin(total: unknown, costOfGoods: unknown): Money {
  return round2(toNumber(total) - toNumber(costOfGoods));
}

/** Statut de paiement déduit du montant encaissé, jamais envoyé par le client. */
export function paymentStatusOf(total: Money, amountPaid: Money): PaymentStatus {
  const due = round2(total);
  const paid = round2(amountPaid);
  if (paid <= 0 && due > 0) return 'UNPAID';
  if (paid + 0.005 < due) return 'PARTIAL';
  return 'PAID';
}

/**
 * Regroupe les quantités par produit.
 *
 * Le même produit peut apparaître sur plusieurs lignes — 2 cartons puis 5 pièces.
 * Le stock doit être décrémenté une seule fois par produit : deux UPDATE sur la
 * même ligne dans une transaction non interactive se marcheraient dessus.
 */
export function baseQuantitiesByProduct(
  lines: Pick<PricedLine, 'productId' | 'baseQuantity'>[]
): Map<string, Quantity> {
  const totals = new Map<string, Quantity>();
  lines.forEach((line) => {
    totals.set(line.productId, round3((totals.get(line.productId) || 0) + line.baseQuantity));
  });
  return totals;
}
