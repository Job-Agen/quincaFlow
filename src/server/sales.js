import { getSql, one, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, notFound, conflict } from '../lib/http';
import { str, num, list, enumValue } from '../lib/validate';
import { round2, round3 } from '../utils/money';
import { nextReference } from '../lib/references';
import { loadCatalog } from './products';
import {
  PAYMENT_METHODS,
  baseQuantitiesByProduct,
  buildSaleLine,
  paymentStatusOf,
  totalsOf,
} from '../domain/sale';

/**
 * Ventes.
 *
 * La validation d'une vente est le point où QuincaFlow tient sa promesse :
 * une information saisie une fois met à jour tout ce qui en dépend. Vente,
 * lignes, encaissement, mouvements de stock et stock lui-même sont écrits dans
 * une transaction unique (§12) — on n'obtient jamais une vente enregistrée dont
 * le stock n'aurait pas bougé, ni l'inverse.
 */

/**
 * Construit les lignes chiffrées à partir du panier envoyé par le client.
 *
 * Le client n'envoie que des identifiants et des quantités : prix, coûts et
 * totaux sont relus en base et recalculés ici. Le frontend n'est jamais la
 * source de vérité financière (§35).
 */
async function priceLines(businessId, rawLines) {
  const entries = list(rawLines, 'lignes').map((line, index) => ({
    productId: str(line.productId, `produit (ligne ${index + 1})`),
    unitId: line.unitId ?? null,
    quantity: round3(num(line.quantity, `quantité (ligne ${index + 1})`, { min: 0.001 })),
    unitPrice:
      line.unitPrice === undefined || line.unitPrice === null || line.unitPrice === ''
        ? null
        : round2(num(line.unitPrice, `prix (ligne ${index + 1})`, { min: 0 })),
  }));

  const catalog = await loadCatalog(
    businessId,
    entries.map((entry) => entry.productId)
  );

  return entries.map((entry) => {
    const found = catalog.get(entry.productId);
    if (!found) throw badRequest('Un produit du panier est introuvable dans votre catalogue.');
    return buildSaleLine(entry, found.product, found.units);
  });
}

/**
 * Requêtes qui décrémentent le stock et journalisent le mouvement.
 *
 * L'UPDATE précède l'INSERT afin que `stock_after` lise, dans la même
 * transaction, le stock réellement obtenu plutôt qu'une valeur calculée à
 * l'avance et déjà périmée. La contrainte `stock_quantity >= 0` fait le reste :
 * une survente fait échouer toute la transaction.
 */
function stockQueries(sql, session, { productId, delta, type, referenceId, referenceType, note }) {
  return [
    sql`
      UPDATE products
         SET stock_quantity = stock_quantity + ${delta}, updated_at = now()
       WHERE id = ${productId} AND business_id = ${session.businessId}
    `,
    sql`
      INSERT INTO stock_movements (
        id, business_id, product_id, type, quantity, stock_after,
        reference_type, reference_id, user_id, note
      ) VALUES (
        ${newId('mv')}, ${session.businessId}, ${productId}, ${type}, ${delta},
        (SELECT stock_quantity FROM products
          WHERE id = ${productId} AND business_id = ${session.businessId}),
        ${referenceType}, ${referenceId}, ${session.userId}, ${note ?? null}
      )
    `,
  ];
}

export async function createSale(session, body) {
  const lines = await priceLines(session.businessId, body.lines);
  const totals = totalsOf(lines, num(body.discount, 'remise', { min: 0, required: false }));

  const paymentMethod = enumValue(
    body.paymentMethod || 'CASH',
    'mode de paiement',
    PAYMENT_METHODS
  );
  // Sans montant précisé, la vente est réputée réglée intégralement : c'est le
  // cas de très loin le plus courant au comptoir.
  const amountPaid =
    body.amountPaid === undefined || body.amountPaid === null || body.amountPaid === ''
      ? totals.total
      : round2(num(body.amountPaid, 'montant encaissé', { min: 0 }));
  const paymentStatus = paymentStatusOf(totals.total, amountPaid);

  const customerId = str(body.customerId, 'client', { required: false });
  const customerName = customerId
    ? await customerNameOf(session.businessId, customerId)
    : str(body.customerName, 'client', { required: false }) || 'Client comptoir';

  const saleId = newId('sal');
  // Les deux numéros sont réservés en parallèle : ce sont deux allers-retours
  // vers Neon, et les enchaîner se verrait sur une connexion mobile.
  const [reference, invoiceReference] = await Promise.all([
    nextReference(session.businessId, 'SALE'),
    nextReference(session.businessId, 'INVOICE'),
  ]);
  const sql = getSql();

  const queries = [
    sql`
      INSERT INTO sales (
        id, business_id, reference, invoice_reference, customer_id, customer_name, user_id,
        subtotal, discount, total, cost_of_goods,
        payment_method, amount_paid, payment_status, status, note
      ) VALUES (
        ${saleId}, ${session.businessId}, ${reference}, ${invoiceReference},
        ${customerId}, ${customerName},
        ${session.userId}, ${totals.subtotal}, ${totals.discount}, ${totals.total},
        ${totals.costOfGoods}, ${paymentMethod}, ${amountPaid}, ${paymentStatus},
        'COMPLETED', ${str(body.note, 'note', { required: false, max: 500 })}
      )
    `,
    ...lines.map(
      (line, index) => sql`
        INSERT INTO sale_items (
          id, business_id, sale_id, product_id, product_name,
          unit_label, unit_factor, quantity, unit_price, line_total, unit_cost, position
        ) VALUES (
          ${newId('sit')}, ${session.businessId}, ${saleId}, ${line.productId}, ${line.productName},
          ${line.unitLabel}, ${line.unitFactor}, ${line.quantity}, ${line.unitPrice},
          ${line.lineTotal}, ${line.unitCost}, ${index}
        )
      `
    ),
  ];

  if (amountPaid > 0) {
    queries.push(sql`
      INSERT INTO payments (id, business_id, sale_id, method, amount)
      VALUES (${newId('pay')}, ${session.businessId}, ${saleId}, ${paymentMethod}, ${amountPaid})
    `);
  }

  // Un produit peut apparaître sur plusieurs lignes — 2 cartons puis 5 pièces.
  // Le regroupement garantit un seul UPDATE par produit : deux UPDATE sur la
  // même ligne dans une transaction non interactive se marcheraient dessus.
  baseQuantitiesByProduct(lines).forEach((quantity, productId) => {
    queries.push(
      ...stockQueries(sql, session, {
        productId,
        delta: -quantity,
        type: 'SALE',
        referenceType: 'SALE',
        referenceId: saleId,
        note: reference,
      })
    );
  });

  await runTransaction(queries);
  return getSale(session.businessId, saleId);
}

async function customerNameOf(businessId, customerId) {
  const row = one(
    await getSql()`
      SELECT name FROM customers WHERE id = ${customerId} AND business_id = ${businessId}
    `
  );
  if (!row) throw badRequest('Client introuvable.');
  return row.name;
}

const SALE_COLUMNS = `
  id, business_id, reference, invoice_reference, customer_id, customer_name, user_id,
  subtotal::float8 AS subtotal, discount::float8 AS discount, total::float8 AS total,
  cost_of_goods::float8 AS cost_of_goods, amount_paid::float8 AS amount_paid,
  payment_method, payment_status, status, note, created_at
`;

export async function getSale(businessId, saleId) {
  const sql = getSql();
  const sale = one(
    await sql`
      SELECT ${sql.unsafe(SALE_COLUMNS)} FROM sales
       WHERE id = ${saleId} AND business_id = ${businessId}
    `
  );
  if (!sale) throw notFound('Vente introuvable.');

  const items = await sql`
    SELECT id, product_id, product_name, unit_label,
           unit_factor::float8 AS unit_factor, quantity::float8 AS quantity,
           unit_price::float8 AS unit_price, line_total::float8 AS line_total,
           unit_cost::float8 AS unit_cost
      FROM sale_items
     WHERE sale_id = ${saleId} AND business_id = ${businessId}
     ORDER BY position
  `;

  return { ...sale, items };
}

export async function listSales(businessId, { from, to, search = '', limit = 100 } = {}) {
  const sql = getSql();
  const term = search.trim() ? `%${search.trim()}%` : null;
  return sql`
    SELECT ${sql.unsafe(SALE_COLUMNS)} FROM sales
     WHERE business_id = ${businessId}
       AND (${from ?? null}::timestamptz IS NULL OR created_at >= ${from ?? null})
       AND (${to ?? null}::timestamptz IS NULL OR created_at < ${to ?? null})
       AND (
         ${term}::text IS NULL
         OR reference ILIKE ${term}
         OR customer_name ILIKE ${term}
         OR EXISTS (
           SELECT 1 FROM sale_items i
            WHERE i.sale_id = sales.id AND i.product_name ILIKE ${term}
         )
       )
     ORDER BY created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `;
}

/**
 * Annulation (§25).
 *
 * Une vente validée n'est jamais supprimée : elle est marquée CANCELLED et le
 * stock est restitué par un mouvement inverse. Le journal conserve ainsi la
 * trace de ce qui s'est réellement passé — la vente a bien eu lieu, puis a été
 * annulée — plutôt que de faire disparaître l'épisode.
 */
export async function cancelSale(session, saleId, reason) {
  const sale = await getSale(session.businessId, saleId);
  if (sale.status === 'CANCELLED') throw conflict('Cette vente est déjà annulée.');

  const note = str(reason, 'motif', { required: false, max: 200 });
  const sql = getSql();
  const queries = [
    sql`
      UPDATE sales SET status = 'CANCELLED', note = ${note}, updated_at = now()
       WHERE id = ${saleId} AND business_id = ${session.businessId} AND status = 'COMPLETED'
    `,
  ];

  const restored = new Map();
  sale.items.forEach((item) => {
    if (!item.product_id) return;
    const quantity = round3(item.quantity * item.unit_factor);
    restored.set(item.product_id, round3((restored.get(item.product_id) || 0) + quantity));
  });

  restored.forEach((quantity, productId) => {
    queries.push(
      ...stockQueries(sql, session, {
        productId,
        delta: quantity,
        type: 'SALE_CANCEL',
        referenceType: 'SALE',
        referenceId: saleId,
        note: `Annulation ${sale.reference}`,
      })
    );
  });

  await runTransaction(queries);
  return getSale(session.businessId, saleId);
}
