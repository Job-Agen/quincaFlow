import { getSql } from './db';

/**
 * Numérotation des documents : VE-0001, FA-2026-0001, HS-0001, PO-0042, RC-0007.
 *
 * Le compteur est incrémenté par un unique `UPDATE … RETURNING`, donc atomique
 * même si deux vendeurs valident au même instant. Il est volontairement bumpé
 * *avant* la transaction métier : si celle-ci échoue, un numéro est consommé
 * pour rien. Un trou dans la numérotation est sans conséquence — deux ventes
 * portant le même numéro, non.
 */

const FORMATS = {
  SALE: { prefix: 'VE', pad: 4, yearly: false },
  INVOICE: { prefix: 'FA', pad: 4, yearly: true },
  OUT_OF_STOCK: { prefix: 'HS', pad: 4, yearly: false },
  PURCHASE_ORDER: { prefix: 'PO', pad: 4, yearly: false },
  RECEIPT: { prefix: 'RC', pad: 4, yearly: false },
};

/**
 * Réserve le prochain numéro de `kind` pour la boutique et renvoie la référence
 * formatée. Les compteurs annuels (facture) repartent à 1 chaque année civile.
 */
export async function nextReference(businessId, kind) {
  const format = FORMATS[kind];
  if (!format) throw new Error(`Type de référence inconnu : ${kind}`);

  const year = new Date().getFullYear();
  const counterKey = format.yearly ? `${kind}:${year}` : kind;
  const sql = getSql();

  const rows = await sql`
    INSERT INTO counters (business_id, kind, value)
    VALUES (${businessId}, ${counterKey}, 1)
    ON CONFLICT (business_id, kind)
      DO UPDATE SET value = counters.value + 1
    RETURNING value
  `;

  const value = String(rows[0].value).padStart(format.pad, '0');
  return format.yearly
    ? `${format.prefix}-${year}-${value}`
    : `${format.prefix}-${value}`;
}
