import { getSql, one } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, conflict, notFound } from '../lib/http';
import { str, num, enumValue } from '../lib/validate';
import { round2, round3 } from '../utils/money';
import { referenceFormat } from '../lib/references';
import { resolveCustomerName } from './contacts';
import { OOS_STATUSES, canTransition, marginOf } from '../domain/outOfStock';

/**
 * Ventes hors stock (§16-18).
 *
 * Le produit est acheté chez un confrère pour satisfaire une demande précise :
 * il ne rejoint jamais le stock. Aucun mouvement n'est donc écrit ici, et c'est
 * délibéré — comptabiliser cette pièce en entrée puis en sortie gonflerait le
 * stock d'un article que la boutique n'a jamais eu l'intention de détenir.
 */

const COLUMNS = `
  id, business_id, reference, customer_id, customer_name, product_id, product_name,
  other_seller, quantity::float8 AS quantity, cost_price::float8 AS cost_price,
  selling_price::float8 AS selling_price, gross_margin::float8 AS gross_margin,
  status, note, created_at, updated_at
`;

export async function listOutOfStockSales(businessId, { from, to, search = '', limit = 100 } = {}) {
  const sql = getSql();
  const term = search.trim() ? `%${search.trim()}%` : null;
  return sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM out_of_stock_sales
     WHERE business_id = ${businessId}
       AND (${from ?? null}::timestamptz IS NULL OR created_at >= ${from ?? null})
       AND (${to ?? null}::timestamptz IS NULL OR created_at < ${to ?? null})
       AND (${term}::text IS NULL
            OR reference ILIKE ${term}
            OR product_name ILIKE ${term}
            OR customer_name ILIKE ${term}
            OR other_seller ILIKE ${term})
     ORDER BY created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `;
}

export async function getOutOfStockSale(businessId, id) {
  const sql = getSql();
  const row = one(
    await sql`
      SELECT ${sql.unsafe(COLUMNS)} FROM out_of_stock_sales
       WHERE id = ${id} AND business_id = ${businessId}
    `
  );
  if (!row) throw notFound('Opération introuvable.');
  return row;
}

export async function createOutOfStockSale(session, body) {
  const quantity = round3(num(body.quantity, 'quantité', { min: 0.001, required: false }) || 1);
  const costPrice = round2(num(body.costPrice, "coût d'achat", { min: 0 }));
  const sellingPrice = round2(num(body.sellingPrice, 'prix de vente client', { min: 0 }));

  // Le produit peut exister au catalogue (rupture) ou pas du tout : les deux cas
  // se produisent au comptoir, et le second ne doit pas obliger à créer une fiche.
  const productId = str(body.productId, 'produit', { required: false });
  let productName = str(body.productName, 'produit', { required: false });
  if (productId) {
    const product = one(
      await getSql()`
        SELECT name FROM products WHERE id = ${productId} AND business_id = ${session.businessId}
      `
    );
    if (!product) throw badRequest('Produit introuvable dans votre catalogue.');
    productName = product.name;
  }
  if (!productName) throw badRequest('Indiquez le produit demandé par le client.');

  const customerId = str(body.customerId, 'client', { required: false });
  // Même règle que pour une vente : le client désigné impose son nom, relu en
  // base. Sans cela l'opération portait « Client comptoir » quel que soit le
  // client choisi, et la recherche par nom ne la retrouvait jamais.
  const customerName = await resolveCustomerName(session.businessId, customerId, body.customerName);
  const id = newId('oos');
  const format = referenceFormat('OUT_OF_STOCK');

  // Le numéro est tiré par la CTE, dans la même instruction que l'insertion :
  // une opération rejetée ne laisse pas un HS- consommé derrière elle.
  await getSql()`
    WITH numero AS (
      INSERT INTO counters (business_id, kind, value)
      VALUES (${session.businessId}, ${format.counterKey}, 1)
      ON CONFLICT (business_id, kind) DO UPDATE SET value = counters.value + 1
      RETURNING value
    )
    INSERT INTO out_of_stock_sales (
      id, business_id, reference, customer_id, customer_name, product_id, product_name,
      other_seller, quantity, cost_price, selling_price, gross_margin, status, note, user_id
    ) VALUES (
      ${id}, ${session.businessId},
      ${format.prefix}::text || lpad((SELECT value FROM numero)::text, ${format.pad}::int, '0'),
      ${customerId}, ${customerName},
      ${productId}, ${productName},
      ${str(body.otherSeller, 'autre vendeur', { required: false, max: 160 })},
      ${quantity}, ${costPrice}, ${sellingPrice},
      ${marginOf({ quantity, costPrice, sellingPrice })},
      'TO_SOURCE', ${str(body.note, 'note', { required: false, max: 500 })}, ${session.userId}
    )
  `;

  return getOutOfStockSale(session.businessId, id);
}

/**
 * Avance l'opération d'une étape du workflow (§17).
 *
 * Les transitions sont contraintes : passer de « à récupérer » directement à
 * « terminé » masquerait qu'aucun paiement n'a été constaté, ni côté client ni
 * côté confrère.
 */
export async function advanceOutOfStockSale(session, id, body) {
  const current = await getOutOfStockSale(session.businessId, id);
  const status = enumValue(body.status, 'statut', OOS_STATUSES);
  if (!canTransition(current.status, status)) {
    throw conflict("Cette étape ne peut pas suivre l'étape actuelle.");
  }

  await getSql()`
    UPDATE out_of_stock_sales
       SET status = ${status},
           note = COALESCE(${str(body.note, 'note', { required: false, max: 500 })}, note),
           updated_at = now()
     WHERE id = ${id} AND business_id = ${session.businessId}
  `;

  return getOutOfStockSale(session.businessId, id);
}
