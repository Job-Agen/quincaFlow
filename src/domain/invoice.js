import { amount, dateTime, money, quantity } from '../utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from './sale';

/**
 * Document de facture (§15).
 *
 * Cette fonction ne dessine rien : elle produit le contenu exact du document,
 * déjà mis en forme. Le rendu PDF et le rendu HTML de l'écran partent donc de la
 * même source, et un test peut affirmer ce qui sera imprimé sans instancier de
 * moteur PDF.
 *
 * Les montants sont formatés ici plutôt que dans le rendu : une facture dont le
 * total serait arrondi différemment selon qu'on l'imprime ou qu'on l'exporte
 * serait un document faux.
 */
export function buildInvoiceDocument({ sale, business, currency = 'FCFA' }) {
  const cancelled = sale.status === 'CANCELLED';

  return {
    seller: {
      name: business?.name || 'Facture',
      lines: [
        business?.tagline,
        business?.address,
        business?.phone ? `Tél : ${business.phone}` : '',
      ]
        .map((line) => (line || '').trim())
        .filter(Boolean),
    },

    reference: sale.invoice_reference,
    meta: [
      `N° : ${sale.invoice_reference}`,
      `Date : ${dateTime(sale.created_at)}`,
      `Client : ${sale.customer_name || 'Client comptoir'}`,
      `Vente : ${sale.reference}`,
    ],

    rows: sale.items.map((item) => ({
      // Le conditionnement n'est rappelé que s'il diffère de l'unité de base :
      // « Vis (pièce) » sur chaque ligne alourdirait la facture sans rien dire.
      designation:
        item.unit_factor > 1 ? `${item.product_name} (${item.unit_label})` : item.product_name,
      quantity: quantity(item.quantity),
      unitPrice: amount(item.unit_price),
      lineTotal: amount(item.line_total),
    })),

    discount: sale.discount > 0 ? amount(sale.discount) : null,
    total: money(sale.total, currency),

    paymentMethod: PAYMENT_METHOD_LABELS[sale.payment_method] || '',
    // Sur une vente annulée, « Payée » affirmerait quelque chose de faux :
    // l'encaissement a été rendu. Même règle que sur l'écran.
    paymentStatus: cancelled ? 'Annulée' : PAYMENT_STATUS_LABELS[sale.payment_status] || '',

    cancelled,
    footer: cancelled
      ? `Facture annulée le ${dateTime(sale.updated_at || sale.created_at)}${
          sale.note ? ` — ${sale.note}` : ''
        }. Ce document ne vaut pas justificatif.`
      : 'Merci pour votre confiance !',
  };
}

/** Nom de fichier d'une facture exportée : « Facture-FA-2026-00124.pdf ». */
export function invoiceFileName(document) {
  const reference = String(document.reference || 'facture').replace(/[^\w-]+/g, '-');
  return `Facture-${reference}.pdf`;
}
