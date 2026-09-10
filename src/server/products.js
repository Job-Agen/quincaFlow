import { getSql, one, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { notFound, badRequest } from '../lib/http';
import { str, num } from '../lib/validate';
import { round2, round3 } from '../utils/money';
import { unitsOf } from '../domain/units';

/**
 * Accès aux produits.
 *
 * Toutes les requêtes filtrent sur `business_id` (§29). Une lecture par
 * identifiant seul laisserait une quincaillerie atteindre le catalogue d'une
 * autre : le `business_id` fait partie de la clé de lecture, jamais d'un simple
 * filtre d'affichage.
 *
 * Les colonnes numeric sont converties en float8 à la lecture : sans cela le
 * pilote les renvoie en chaînes et « 45 » + « 5 » vaudrait « 455 » côté client.
 */

const COLUMNS = `
  id, business_id, name, sku, description, base_unit,
  purchase_price::float8 AS purchase_price,
  selling_price::float8 AS selling_price,
  stock_quantity::float8 AS stock_quantity,
  low_stock_threshold::float8 AS low_stock_threshold,
  archived, created_at, updated_at
`;

/**
 * Liste filtrable du catalogue, conditionnements compris. `filter` : all|low|out.
 *
 * Les unités sont jointes ici parce que l'écran de vente en a besoin pour chaque
 * article proposé : les charger à la sélection d'un produit ajouterait une
 * attente réseau au moment précis où le vendeur ne doit pas en avoir.
 */
export async function listProducts(businessId, { search = '', filter = 'all', limit = 200 } = {}) {
  const sql = getSql();
  const term = search.trim() ? `%${search.trim()}%` : null;

  const products = await sql`
    SELECT ${sql.unsafe(COLUMNS)}
      FROM products
     WHERE business_id = ${businessId}
       AND archived = false
       AND (${term}::text IS NULL OR name ILIKE ${term} OR sku ILIKE ${term})
       AND (
         ${filter}::text = 'all'
         OR (${filter}::text = 'out' AND stock_quantity <= 0)
         OR (${filter}::text = 'low' AND low_stock_threshold > 0
             AND stock_quantity <= low_stock_threshold)
       )
     ORDER BY name
     LIMIT ${Math.min(limit, 500)}
  `;
  if (products.length === 0) return products;

  const units = await sql`
    SELECT id, product_id, label, factor::float8 AS factor, price::float8 AS price, is_base
      FROM product_units
     WHERE business_id = ${businessId} AND product_id = ANY(${products.map((p) => p.id)})
  `;

  const byProduct = new Map(products.map((product) => [product.id, []]));
  units.forEach((unit) => byProduct.get(unit.product_id)?.push(unit));

  return products.map((product) => ({
    ...product,
    units: unitsOf(product, byProduct.get(product.id)),
  }));
}

/** Produits en alerte de stock, pour le tableau de bord (§8). */
export async function lowStockProducts(businessId, limit = 20) {
  const sql = getSql();
  return sql`
    SELECT ${sql.unsafe(COLUMNS)}
      FROM products
     WHERE business_id = ${businessId}
       AND archived = false
       AND low_stock_threshold > 0
       AND stock_quantity <= low_stock_threshold
     ORDER BY stock_quantity ASC
     LIMIT ${limit}
  `;
}

export async function listUnitRows(businessId, productId) {
  return getSql()`
    SELECT id, product_id, label, factor::float8 AS factor, price::float8 AS price, is_base
      FROM product_units
     WHERE business_id = ${businessId} AND product_id = ${productId}
     ORDER BY factor
  `;
}

export async function getProduct(businessId, productId) {
  const sql = getSql();
  const product = one(
    await sql`
      SELECT ${sql.unsafe(COLUMNS)}
        FROM products
       WHERE id = ${productId} AND business_id = ${businessId}
    `
  );
  if (!product) throw notFound('Produit introuvable.');
  return { ...product, units: unitsOf(product, await listUnitRows(businessId, productId)) };
}

/**
 * Charge plusieurs produits et leurs conditionnements en deux requêtes.
 *
 * Une vente touche N produits ; les charger un par un ferait 2N allers-retours
 * HTTP vers Neon, ce qui se voit à la caisse sur une connexion mobile (§35).
 */
export async function loadCatalog(businessId, productIds) {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const sql = getSql();

  const [products, units] = await Promise.all([
    sql`SELECT ${sql.unsafe(COLUMNS)} FROM products
         WHERE business_id = ${businessId} AND id = ANY(${ids})`,
    sql`SELECT id, product_id, label, factor::float8 AS factor, price::float8 AS price, is_base
          FROM product_units
         WHERE business_id = ${businessId} AND product_id = ANY(${ids})`,
  ]);

  const unitRows = new Map(products.map((product) => [product.id, []]));
  units.forEach((unit) => unitRows.get(unit.product_id)?.push(unit));

  return new Map(
    products.map((product) => [
      product.id,
      { product, units: unitsOf(product, unitRows.get(product.id)) },
    ])
  );
}

/**
 * Conditionnements saisis dans un formulaire produit.
 *
 * L'unité de base est toujours réinjectée en tête, au prix de vente du produit :
 * c'est elle qui donne son sens au stock, tous les autres facteurs s'y rapportent.
 */
function parseUnits(input, baseUnit, sellingPrice) {
  const extra = (Array.isArray(input) ? input : [])
    .map((row) => ({
      label: str(row.label, 'libellé du conditionnement', { max: 60 }),
      factor: round3(num(row.factor, 'contenu du conditionnement', { min: 0.001 })),
      price: round2(num(row.price, 'prix du conditionnement', { min: 0 })),
      isBase: false,
    }))
    .filter((row) => row.factor !== 1);

  return [{ label: baseUnit, factor: 1, price: round2(sellingPrice), isBase: true }, ...extra];
}

function readProductInput(body) {
  const sellingPrice = round2(num(body.sellingPrice, 'prix de vente', { min: 0 }));
  const baseUnit = str(body.baseUnit, 'unité de base', { required: false, max: 40 }) || 'pièce';
  return {
    name: str(body.name, 'nom', { max: 160 }),
    sku: str(body.sku, 'référence', { required: false, max: 60 }),
    description: str(body.description, 'description', { required: false, max: 1000 }),
    baseUnit,
    purchasePrice: round2(num(body.purchasePrice, "prix d'achat", { min: 0, required: false })),
    sellingPrice,
    lowStockThreshold: round3(
      num(body.lowStockThreshold, "seuil d'alerte", { min: 0, required: false })
    ),
    units: parseUnits(body.units, baseUnit, sellingPrice),
  };
}

function insertUnits(sql, businessId, productId, units) {
  return units.map(
    (unit) => sql`
      INSERT INTO product_units (id, business_id, product_id, label, factor, price, is_base)
      VALUES (${newId('pu')}, ${businessId}, ${productId},
              ${unit.label}, ${unit.factor}, ${unit.price}, ${unit.isBase})
    `
  );
}

export async function createProduct(session, body) {
  const input = readProductInput(body);
  const initialStock = round3(num(body.stockQuantity, 'stock initial', { min: 0, required: false }));
  const productId = newId('prd');
  const sql = getSql();

  const queries = [
    sql`
      INSERT INTO products (
        id, business_id, name, sku, description, base_unit,
        purchase_price, selling_price, stock_quantity, low_stock_threshold
      ) VALUES (
        ${productId}, ${session.businessId}, ${input.name}, ${input.sku}, ${input.description},
        ${input.baseUnit}, ${input.purchasePrice}, ${input.sellingPrice},
        ${initialStock}, ${input.lowStockThreshold}
      )
    `,
    ...insertUnits(sql, session.businessId, productId, input.units),
  ];

  // Un stock initial est un ajustement d'inventaire, pas une réception. Sans ce
  // mouvement, le premier écart constaté sur le produit semblerait sorti de nulle part.
  if (initialStock > 0) {
    queries.push(sql`
      INSERT INTO stock_movements (
        id, business_id, product_id, type, quantity, stock_after,
        reference_type, reference_id, user_id, note
      ) VALUES (
        ${newId('mv')}, ${session.businessId}, ${productId}, 'ADJUSTMENT', ${initialStock},
        ${initialStock}, 'PRODUCT', ${productId}, ${session.userId}, 'Stock initial'
      )
    `);
  }

  await runTransaction(queries);
  return getProduct(session.businessId, productId);
}

export async function updateProduct(session, productId, body) {
  await getProduct(session.businessId, productId);
  const input = readProductInput(body);
  const sql = getSql();

  // Les conditionnements sont remplacés en bloc : la table ne porte que l'état
  // courant, les ventes passées ayant figé leurs propres libellés.
  await runTransaction([
    sql`
      UPDATE products
         SET name = ${input.name}, sku = ${input.sku}, description = ${input.description},
             base_unit = ${input.baseUnit}, purchase_price = ${input.purchasePrice},
             selling_price = ${input.sellingPrice},
             low_stock_threshold = ${input.lowStockThreshold}, updated_at = now()
       WHERE id = ${productId} AND business_id = ${session.businessId}
    `,
    sql`DELETE FROM product_units
         WHERE product_id = ${productId} AND business_id = ${session.businessId}`,
    ...insertUnits(sql, session.businessId, productId, input.units),
  ]);

  return getProduct(session.businessId, productId);
}

/**
 * Archivage plutôt que suppression (§9) : un produit déjà vendu reste référencé
 * par des lignes de facture et des mouvements de stock.
 */
export async function archiveProduct(session, productId) {
  await getProduct(session.businessId, productId);
  await getSql()`
    UPDATE products SET archived = true, updated_at = now()
     WHERE id = ${productId} AND business_id = ${session.businessId}
  `;
}

/**
 * Ajustement d'inventaire : le gérant saisit le stock réellement compté et le
 * journal enregistre l'écart avec son motif (§26).
 */
export async function adjustStock(session, productId, body) {
  const product = await getProduct(session.businessId, productId);
  const counted = round3(num(body.stockQuantity, 'stock compté', { min: 0 }));
  const reason = str(body.reason, 'motif', { max: 200 });
  const delta = round3(counted - product.stock_quantity);
  if (delta === 0) throw badRequest('Le stock compté est identique au stock actuel.');

  const sql = getSql();
  await runTransaction([
    sql`
      UPDATE products SET stock_quantity = ${counted}, updated_at = now()
       WHERE id = ${productId} AND business_id = ${session.businessId}
    `,
    sql`
      INSERT INTO stock_movements (
        id, business_id, product_id, type, quantity, stock_after,
        reference_type, reference_id, user_id, note
      ) VALUES (
        ${newId('mv')}, ${session.businessId}, ${productId}, 'ADJUSTMENT', ${delta},
        ${counted}, 'PRODUCT', ${productId}, ${session.userId}, ${reason}
      )
    `,
  ]);

  return getProduct(session.businessId, productId);
}

/** Journal des mouvements d'un produit (§26). */
export async function productMovements(businessId, productId, limit = 50) {
  return getSql()`
    SELECT id, type, quantity::float8 AS quantity, stock_after::float8 AS stock_after,
           reference_type, reference_id, note, created_at
      FROM stock_movements
     WHERE business_id = ${businessId} AND product_id = ${productId}
     ORDER BY created_at DESC
     LIMIT ${limit}
  `;
}
