import { getSql, one, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, conflict, notFound } from '../lib/http';
import { str, num, list, enumValue } from '../lib/validate';
import { round2, round3 } from '../utils/money';
import { referenceFormat } from '../lib/references';
import { loadCatalog } from './products';
import { findUnit, weightedAverageCost } from '../domain/units';
import {
  DOCUMENT_KINDS,
  PO_MANUAL_STATUSES,
  orderTotal,
  receptionStatus,
  remainingOf,
} from '../domain/purchase';

/**
 * Commandes fournisseurs et réceptions (§19-22).
 *
 * Règle centrale : commander n'est pas posséder. Créer une commande de 50 sacs
 * n'écrit aucun mouvement de stock ; seule la réception effective en écrit un, à
 * hauteur de ce qui a réellement été livré. La livraison partielle en découle
 * naturellement plutôt que d'être un cas particulier greffé après coup.
 */

const ORDER_COLUMNS = `
  id, business_id, reference, supplier_id, supplier_name, status,
  total_estimated::float8 AS total_estimated, notes, created_at, updated_at
`;

const ITEM_COLUMNS = `
  id, purchase_order_id, product_id, product_name, unit_label,
  unit_factor::float8 AS unit_factor,
  quantity_ordered::float8 AS quantity_ordered,
  quantity_received::float8 AS quantity_received,
  unit_cost::float8 AS unit_cost, position
`;

export async function listPurchaseOrders(businessId, { search = '', limit = 100 } = {}) {
  const sql = getSql();
  const term = search.trim() ? `%${search.trim()}%` : null;
  return sql`
    SELECT ${sql.unsafe(ORDER_COLUMNS)} FROM purchase_orders
     WHERE business_id = ${businessId}
       AND (${term}::text IS NULL OR reference ILIKE ${term} OR supplier_name ILIKE ${term})
     ORDER BY created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `;
}

export async function getPurchaseOrder(businessId, orderId) {
  const sql = getSql();
  const order = one(
    await sql`
      SELECT ${sql.unsafe(ORDER_COLUMNS)} FROM purchase_orders
       WHERE id = ${orderId} AND business_id = ${businessId}
    `
  );
  if (!order) throw notFound('Commande introuvable.');

  const [items, receipts, documents] = await Promise.all([
    sql`SELECT ${sql.unsafe(ITEM_COLUMNS)} FROM purchase_order_items
         WHERE purchase_order_id = ${orderId} AND business_id = ${businessId}
         ORDER BY position`,
    sql`SELECT id, reference, notes, received_at FROM purchase_receipts
         WHERE purchase_order_id = ${orderId} AND business_id = ${businessId}
         ORDER BY received_at DESC`,
    sql`SELECT id, kind, name, url, created_at FROM documents
         WHERE business_id = ${businessId}
           AND reference_type = 'PURCHASE_ORDER' AND reference_id = ${orderId}
         ORDER BY created_at`,
  ]);

  return { ...order, items, receipts, documents };
}

/**
 * Lignes d'une commande.
 *
 * Chaque ligne référence un produit du catalogue : c'est ce qui permettra à la
 * réception d'augmenter le bon stock, dans la bonne unité de base. Commander un
 * article encore inconnu suppose donc de le créer d'abord — c'est aussi le
 * moment où on lui fixe un prix de vente.
 */
async function readItems(businessId, rawItems) {
  const entries = list(rawItems, 'produits').map((item, index) => ({
    productId: str(item.productId, `produit (ligne ${index + 1})`),
    unitId: item.unitId ?? null,
    quantity: round3(num(item.quantity, `quantité (ligne ${index + 1})`, { min: 0.001 })),
    unitCost: round2(num(item.unitCost, `coût (ligne ${index + 1})`, { min: 0, required: false })),
  }));

  const catalog = await loadCatalog(
    businessId,
    entries.map((entry) => entry.productId)
  );

  return entries.map((entry) => {
    const found = catalog.get(entry.productId);
    if (!found) throw badRequest('Un produit de la commande est introuvable dans votre catalogue.');
    const unit = findUnit(found.units, entry.unitId);
    return {
      productId: found.product.id,
      productName: found.product.name,
      unitLabel: unit.label,
      unitFactor: unit.factor,
      quantityOrdered: entry.quantity,
      // À défaut de coût saisi, on retient le coût connu du produit ramené au
      // conditionnement commandé : commander au carton n'est pas commander à la pièce.
      unitCost: entry.unitCost || round2((found.product.purchase_price || 0) * unit.factor),
    };
  });
}

export async function createPurchaseOrder(session, body) {
  const items = await readItems(session.businessId, body.items);
  const supplierId = str(body.supplierId, 'fournisseur', { required: false });
  let supplierName = str(body.supplierName, 'fournisseur', { required: false });

  if (supplierId) {
    const supplier = one(
      await getSql()`
        SELECT name FROM suppliers WHERE id = ${supplierId} AND business_id = ${session.businessId}
      `
    );
    if (!supplier) throw badRequest('Fournisseur introuvable.');
    supplierName = supplier.name;
  }
  if (!supplierName) throw badRequest('Indiquez le fournisseur.');

  const orderId = newId('po');
  const format = referenceFormat('PURCHASE_ORDER');
  const sql = getSql();

  await runTransaction([
    // Numéro tiré dans la transaction : une commande dont les lignes seraient
    // rejetées n'emporte pas un PO- avec elle.
    sql`
      WITH numero AS (
        INSERT INTO counters (business_id, kind, value)
        VALUES (${session.businessId}, ${format.counterKey}, 1)
        ON CONFLICT (business_id, kind) DO UPDATE SET value = counters.value + 1
        RETURNING value
      )
      INSERT INTO purchase_orders (
        id, business_id, reference, supplier_id, supplier_name,
        status, total_estimated, notes, user_id
      ) VALUES (
        ${orderId}, ${session.businessId},
        ${format.prefix}::text || lpad((SELECT value FROM numero)::text, ${format.pad}::int, '0'),
        ${supplierId}, ${supplierName},
        'DRAFT', ${orderTotal(items)},
        ${str(body.notes, 'notes', { required: false, max: 1000 })}, ${session.userId}
      )
    `,
    ...items.map(
      (item, index) => sql`
        INSERT INTO purchase_order_items (
          id, business_id, purchase_order_id, product_id, product_name,
          unit_label, unit_factor, quantity_ordered, unit_cost, position
        ) VALUES (
          ${newId('poi')}, ${session.businessId}, ${orderId}, ${item.productId}, ${item.productName},
          ${item.unitLabel}, ${item.unitFactor}, ${item.quantityOrdered}, ${item.unitCost}, ${index}
        )
      `
    ),
  ]);

  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Change le statut administratif d'une commande (envoyée, facture reçue, payée…).
 * Les statuts de livraison ne sont pas modifiables à la main : ils sont déduits
 * des quantités effectivement reçues.
 */
export async function updatePurchaseOrderStatus(session, orderId, body) {
  const order = await getPurchaseOrder(session.businessId, orderId);
  const status = enumValue(body.status, 'statut', PO_MANUAL_STATUSES);
  if (order.status === 'CANCELLED') throw conflict('Cette commande est annulée.');
  if (status === 'CANCELLED' && order.items.some((item) => item.quantity_received > 0)) {
    throw conflict('Cette commande a déjà été partiellement livrée.');
  }

  await getSql()`
    UPDATE purchase_orders SET status = ${status}, updated_at = now()
     WHERE id = ${orderId} AND business_id = ${session.businessId}
  `;
  return getPurchaseOrder(session.businessId, orderId);
}

/** Pièce jointe : bon de commande, facture fournisseur, preuve de paiement (§20). */
export async function attachDocument(session, orderId, body) {
  await getPurchaseOrder(session.businessId, orderId);
  const kind = enumValue(body.kind, 'type de document', Object.keys(DOCUMENT_KINDS));
  await getSql()`
    INSERT INTO documents (id, business_id, kind, reference_type, reference_id, name, url)
    VALUES (${newId('doc')}, ${session.businessId}, ${kind}, 'PURCHASE_ORDER', ${orderId},
            ${str(body.name, 'nom du document', { max: 200 })},
            ${str(body.url, 'lien', { required: false, max: 2000 })})
  `;
  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Réception d'une livraison (§21-22).
 *
 * C'est ici, et seulement ici, que le stock d'un achat augmente. Le coût d'achat
 * du produit est recalculé en moyenne pondérée : réassortir 400 pièces à 320
 * quand on en détient 100 à 300 donne 316, pas 320. Sans cette pondération, la
 * marge de tous les articles en rayon sauterait à chaque livraison.
 */
export async function receivePurchaseOrder(session, orderId, body) {
  const order = await getPurchaseOrder(session.businessId, orderId);
  if (order.status === 'CANCELLED') throw conflict('Cette commande est annulée.');

  const itemsById = new Map(order.items.map((item) => [item.id, item]));
  const lines = list(body.lines, 'lignes reçues').map((line, index) => {
    const item = itemsById.get(str(line.itemId, `ligne ${index + 1}`));
    if (!item) throw badRequest('Ligne de commande introuvable.');
    const quantity = round3(num(line.quantity, `quantité reçue (ligne ${index + 1})`, { min: 0 }));
    if (quantity > remainingOf(item)) {
      throw conflict(`Vous recevez plus de ${item.product_name} qu'il n'en reste à livrer.`);
    }
    return { item, quantity };
  });

  const received = lines.filter((line) => line.quantity > 0);
  if (received.length === 0) throw badRequest('Indiquez au moins une quantité reçue.');

  const catalog = await loadCatalog(
    session.businessId,
    received.map((line) => line.item.product_id).filter(Boolean)
  );

  const receiptId = newId('rcp');
  const format = referenceFormat('RECEIPT');
  const sql = getSql();

  const queries = [
    // Une réception qui dépasserait le reste à livrer est rejetée par la
    // contrainte : son numéro doit disparaître avec elle.
    sql`
      WITH numero AS (
        INSERT INTO counters (business_id, kind, value)
        VALUES (${session.businessId}, ${format.counterKey}, 1)
        ON CONFLICT (business_id, kind) DO UPDATE SET value = counters.value + 1
        RETURNING value
      )
      INSERT INTO purchase_receipts (
        id, business_id, purchase_order_id, reference, notes, user_id
      ) VALUES (
        ${receiptId}, ${session.businessId}, ${orderId},
        ${format.prefix}::text || lpad((SELECT value FROM numero)::text, ${format.pad}::int, '0'),
        ${str(body.notes, 'notes', { required: false, max: 500 })}, ${session.userId}
      )
    `,
  ];

  // Le coût moyen est cumulé produit par produit : une même livraison peut
  // porter deux lignes du même article (un carton + des pièces), et repartir du
  // coût lu en base pour la seconde ignorerait ce que la première vient d'ajouter.
  const runningCost = new Map();

  received.forEach(({ item, quantity }) => {
    const baseQuantity = round3(quantity * item.unit_factor);
    const unitBaseCost = round2(item.unit_cost / (item.unit_factor || 1));

    queries.push(
      sql`
        INSERT INTO purchase_receipt_items (
          id, business_id, purchase_receipt_id, purchase_order_item_id,
          product_id, quantity, unit_cost
        ) VALUES (
          ${newId('rci')}, ${session.businessId}, ${receiptId}, ${item.id},
          ${item.product_id}, ${quantity}, ${item.unit_cost}
        )
      `,
      sql`
        UPDATE purchase_order_items
           SET quantity_received = quantity_received + ${quantity}
         WHERE id = ${item.id} AND business_id = ${session.businessId}
      `
    );

    if (!item.product_id) return;
    const known = catalog.get(item.product_id);
    if (!known) return;

    const state = runningCost.get(item.product_id) || {
      quantity: known.product.stock_quantity,
      cost: known.product.purchase_price,
    };
    const cost = weightedAverageCost(state.quantity, state.cost, baseQuantity, unitBaseCost);
    runningCost.set(item.product_id, {
      quantity: round3(state.quantity + baseQuantity),
      cost,
    });

    queries.push(
      sql`
        UPDATE products
           SET stock_quantity = stock_quantity + ${baseQuantity},
               purchase_price = ${cost},
               updated_at = now()
         WHERE id = ${item.product_id} AND business_id = ${session.businessId}
      `,
      sql`
        INSERT INTO stock_movements (
          id, business_id, product_id, type, quantity, stock_after,
          reference_type, reference_id, user_id, note
        ) VALUES (
          ${newId('mv')}, ${session.businessId}, ${item.product_id}, 'PURCHASE_RECEIPT',
          ${baseQuantity},
          (SELECT stock_quantity FROM products
            WHERE id = ${item.product_id} AND business_id = ${session.businessId}),
          'PURCHASE_RECEIPT', ${receiptId}, ${session.userId}, ${`Réception ${order.reference}`}
        )
      `
    );
  });

  // Le statut de livraison est recalculé à partir des quantités projetées plutôt
  // que saisi : une commande ne peut pas être « livrée » s'il reste des lignes.
  const projected = order.items.map((item) => {
    const line = received.find((entry) => entry.item.id === item.id);
    return {
      quantityOrdered: item.quantity_ordered,
      quantityReceived: item.quantity_received + (line ? line.quantity : 0),
    };
  });

  queries.push(sql`
    UPDATE purchase_orders SET status = ${receptionStatus(projected, order.status)}, updated_at = now()
     WHERE id = ${orderId} AND business_id = ${session.businessId}
  `);

  await runTransaction(queries);
  return getPurchaseOrder(session.businessId, orderId);
}
