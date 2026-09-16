import { getSql } from '../lib/db';

/**
 * Historique unifié (§24).
 *
 * Ventes, ventes hors stock, commandes et réceptions arrivent dans un même flux
 * chronologique. Le commerçant ne raisonne pas par table : il cherche « ce qui
 * s'est passé mardi », toutes natures confondues.
 *
 * L'UNION est faite en SQL plutôt qu'en mémoire pour que le tri et la limite
 * portent sur l'ensemble : fusionner quatre listes déjà tronquées côté serveur
 * ferait disparaître des opérations pourtant plus récentes.
 */

export const HISTORY_KINDS = ['SALE', 'OUT_OF_STOCK', 'PURCHASE_ORDER', 'RECEIPT'];

export async function listHistory(businessId, { from, to, search = '', kind, limit = 100 } = {}) {
  const sql = getSql();
  const term = search.trim() ? `%${search.trim()}%` : null;
  const kinds = kind && HISTORY_KINDS.includes(kind) ? [kind] : HISTORY_KINDS;

  return sql`
    WITH feed AS (
      SELECT 'SALE' AS kind, s.id, s.reference, s.created_at,
             s.total::float8 AS amount, s.customer_name AS party, s.status
        FROM sales s
       WHERE s.business_id = ${businessId}
         AND (${term}::text IS NULL
              OR s.reference ILIKE ${term} OR s.customer_name ILIKE ${term}
              OR EXISTS (SELECT 1 FROM sale_items i
                          WHERE i.sale_id = s.id AND i.product_name ILIKE ${term}))

      UNION ALL
      SELECT 'OUT_OF_STOCK', o.id, o.reference, o.created_at,
             (o.selling_price * o.quantity)::float8, o.customer_name, o.status
        FROM out_of_stock_sales o
       WHERE o.business_id = ${businessId}
         AND (${term}::text IS NULL
              OR o.reference ILIKE ${term} OR o.customer_name ILIKE ${term}
              OR o.product_name ILIKE ${term} OR o.other_seller ILIKE ${term})

      UNION ALL
      SELECT 'PURCHASE_ORDER', p.id, p.reference, p.created_at,
             p.total_estimated::float8, p.supplier_name, p.status
        FROM purchase_orders p
       WHERE p.business_id = ${businessId}
         AND (${term}::text IS NULL
              OR p.reference ILIKE ${term} OR p.supplier_name ILIKE ${term}
              OR EXISTS (SELECT 1 FROM purchase_order_items i
                          WHERE i.purchase_order_id = p.id AND i.product_name ILIKE ${term}))

      UNION ALL
      SELECT 'RECEIPT', r.id, r.reference, r.received_at,
             (SELECT COALESCE(SUM(ri.quantity * ri.unit_cost), 0)::float8
                FROM purchase_receipt_items ri
               WHERE ri.purchase_receipt_id = r.id),
             o.supplier_name, 'RECEIVED'
        FROM purchase_receipts r
        JOIN purchase_orders o ON o.id = r.purchase_order_id
       WHERE r.business_id = ${businessId}
         AND (${term}::text IS NULL
              OR r.reference ILIKE ${term} OR o.supplier_name ILIKE ${term})
    )
    SELECT * FROM feed
     WHERE kind = ANY(${kinds})
       AND (${from ?? null}::timestamptz IS NULL OR created_at >= ${from ?? null})
       AND (${to ?? null}::timestamptz IS NULL OR created_at < ${to ?? null})
     ORDER BY created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `;
}

/**
 * Traduit un raccourci de période en bornes.
 * `today | 7d | 30d | custom | all` (§24).
 *
 * `custom` lit `range.from` et `range.to`, deux dates `AAAA-MM-JJ` telles que les
 * produit un champ de date. Une borne absente ou illisible laisse ce côté
 * ouvert : « depuis le 1er mars » est une demande légitime, et refuser la
 * recherche entière pour une seule borne manquante n'aiderait personne.
 */
export function periodBounds(period, range = {}) {
  if (period === 'custom') return customBounds(range.from, range.to);

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (period === '7d') start.setDate(start.getDate() - 6);
  else if (period === '30d') start.setDate(start.getDate() - 29);
  else if (period !== 'today') return { from: null, to: null };

  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Bornes d'une période saisie à la main.
 *
 * Les dates sont interprétées dans le fuseau du serveur, comme les autres
 * raccourcis : une journée va de 00:00:00 à 23:59:59 locales, bornes comprises.
 * Un `AAAA-MM-JJ` passé à `new Date()` serait lu en UTC et décalerait la journée.
 */
function customBounds(rawFrom, rawTo) {
  let start = parseDay(rawFrom);
  let end = parseDay(rawTo);

  // Bornes inversées : le commerçant voulait manifestement l'intervalle entre
  // les deux dates. Les remettre d'aplomb vaut mieux qu'une liste vide.
  if (start && end && start > end) [start, end] = [end, start];

  if (end) end.setHours(23, 59, 59, 999);
  return { from: start ? start.toISOString() : null, to: end ? end.toISOString() : null };
}

/** `AAAA-MM-JJ` en date locale à minuit, ou null si la chaîne n'en est pas une. */
function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Rejette les dates qui débordent — « 2026-02-31 » deviendrait le 3 mars.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}
