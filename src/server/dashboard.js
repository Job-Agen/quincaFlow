import { getSql, one } from '../lib/db';
import { round2 } from '../utils/money';
import { grossMargin } from '../domain/sale';
import { lowStockProducts } from './products';

/**
 * Tableau de bord (§8).
 *
 * Il répond à une seule question — « que s'est-il passé dans ma boutique
 * aujourd'hui ? » — et rien d'autre. Pas de graphique, pas d'analyse : cinq
 * chiffres, les alertes de stock et les dernières opérations.
 *
 * Les ventes annulées sont exclues de tous les totaux : elles restent dans
 * l'historique, mais compter une vente annulée dans le chiffre d'affaires du
 * jour donnerait un chiffre que le gérant ne retrouverait pas dans sa caisse.
 */

/** Bornes du jour courant, dans le fuseau du serveur. */
function today() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function dashboard(businessId) {
  const sql = getSql();
  const { start, end } = today();

  const [salesRow, oosRow, recentSales, recentOos, lowStock] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(total), 0)::float8 AS revenue,
             COALESCE(SUM(cost_of_goods), 0)::float8 AS cost
        FROM sales
       WHERE business_id = ${businessId}
         AND status = 'COMPLETED'
         AND created_at >= ${start} AND created_at < ${end}
    `,
    sql`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(gross_margin), 0)::float8 AS margin,
             COALESCE(SUM(selling_price * quantity), 0)::float8 AS revenue
        FROM out_of_stock_sales
       WHERE business_id = ${businessId}
         AND status <> 'CANCELLED'
         AND created_at >= ${start} AND created_at < ${end}
    `,
    sql`
      SELECT id, reference, total::float8 AS total, created_at, 'SALE' AS kind
        FROM sales
       WHERE business_id = ${businessId} AND status = 'COMPLETED'
       ORDER BY created_at DESC LIMIT 8
    `,
    sql`
      SELECT id, reference, (selling_price * quantity)::float8 AS total, created_at,
             'OUT_OF_STOCK' AS kind
        FROM out_of_stock_sales
       WHERE business_id = ${businessId} AND status <> 'CANCELLED'
       ORDER BY created_at DESC LIMIT 8
    `,
    lowStockProducts(businessId, 10),
  ]);

  const sales = one(salesRow);
  const oos = one(oosRow);

  // La marge hors stock est déjà nette de son coût d'achat : elle s'ajoute
  // directement à la marge des ventes en stock.
  const margin = round2(grossMargin(sales.revenue, sales.cost) + oos.margin);

  const activity = [...recentSales, ...recentOos]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  return {
    revenue: round2(sales.revenue),
    purchasesToday: round2(await purchasesToday(businessId, start, end)),
    margin,
    salesCount: sales.count,
    outOfStockCount: oos.count,
    outOfStockRevenue: round2(oos.revenue),
    lowStockCount: lowStock.length,
    lowStock,
    activity,
  };
}

/** Valeur des marchandises effectivement reçues aujourd'hui. */
async function purchasesToday(businessId, start, end) {
  const row = one(
    await getSql()`
      SELECT COALESCE(SUM(i.quantity * i.unit_cost), 0)::float8 AS total
        FROM purchase_receipt_items i
        JOIN purchase_receipts r ON r.id = i.purchase_receipt_id
       WHERE i.business_id = ${businessId}
         AND r.received_at >= ${start} AND r.received_at < ${end}
    `
  );
  return row.total;
}
