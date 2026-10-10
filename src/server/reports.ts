import { getSql, one, rows } from '../lib/db';
import { round2 } from '../utils/money';
import { granularityOf, isOperating, marginRate, periodTotals } from '../domain/report';
import { revenueShare } from '../domain/income';
import { incomesByCategory } from './incomes';
import type {
  ExpenseBucket,
  FinancialReport,
  IncomeBucket,
  PeriodBucket,
  ProductProfit,
} from '@/types';

/**
 * Rapports financiers & marges (§39).
 *
 * Le tableau de bord (§8) regarde la journée en cours ; cet écran regarde une
 * période, et va jusqu'au bénéfice net, dépenses déduites.
 *
 * Trois règles gouvernent tout ce fichier :
 *
 * 1. **Les totaux se reconstituent.** La somme des tranches égale le chiffre
 *    d'affaires de tête, et la somme des produits égale celui des ventes. Un
 *    rapport dont les lignes ne retrouvent pas leur propre total ne sera plus
 *    cru sur aucun de ses chiffres.
 * 2. **Le coût est celui figé à la vente** (`sale_items.unit_cost`, §28). Le
 *    prix d'achat qui montera demain ne doit pas réécrire la marge d'hier.
 * 3. **Une vente annulée ne compte nulle part** (§25). Elle reste dans
 *    l'historique ; l'inclure dans un chiffre d'affaires donnerait un montant
 *    que le gérant ne retrouverait pas en caisse.
 *
 * Tout part en une seule requête d'API (§35) : sur une connexion de comptoir,
 * cinq allers-retours pour un écran coûtent plus que les cinq agrégats réunis.
 */

/** Au-delà de ce nombre de produits, la liste est tronquée (§39). */
const PRODUCT_LIMIT = 200;

export interface ReportBounds {
  from?: string | null;
  to?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

interface SalesAggregate {
  count: number;
  revenue: number;
  cost: number;
}

interface OutOfStockAggregate {
  count: number;
  revenue: number;
  margin: number;
}

/**
 * Tranche telle que Postgres la rend : des colonnes en `snake_case`.
 *
 * La distinction n'est pas décorative. Typer directement ce résultat en
 * `PeriodBucket` ferait lire `bucket.salesCount` sur une ligne qui porte
 * `sales_count` : `undefined`, donc zéro vente affichée sur une journée qui en a
 * vu quarante.
 */
interface BucketRow {
  bucket: string;
  sales_count: number;
  oos_count: number;
  revenue: number;
  cost: number;
  margin: number;
}

interface ProductRowAggregate {
  product_id: string | null;
  product_name: string;
  base_unit: string | null;
  quantity: number;
  revenue: number;
  cost: number;
  oos_quantity: number;
  oos_revenue: number;
  oos_margin: number;
}

export async function financialReport(
  businessId: string,
  { from = null, to = null, fromDate = null, toDate = null }: ReportBounds = {}
): Promise<FinancialReport> {
  const sql = getSql();
  const granularity = granularityOf(from, to);

  const [salesRow, oosRow, expenseRows, bucketRows, productRows, productCountRow] =
    await Promise.all([
      sql`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(total), 0)::float8 AS revenue,
             COALESCE(SUM(cost_of_goods), 0)::float8 AS cost
        FROM sales
       WHERE business_id = ${businessId}
         AND status = 'COMPLETED'
         AND (${from}::timestamptz IS NULL OR created_at >= ${from})
         AND (${to}::timestamptz IS NULL OR created_at <= ${to})
    `,
      sql`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(selling_price * quantity), 0)::float8 AS revenue,
             COALESCE(SUM(gross_margin), 0)::float8 AS margin
        FROM out_of_stock_sales
       WHERE business_id = ${businessId}
         AND status <> 'CANCELLED'
         AND (${from}::timestamptz IS NULL OR created_at >= ${from})
         AND (${to}::timestamptz IS NULL OR created_at <= ${to})
    `,
      // Les dépenses se filtrent sur `spent_on`, une date civile : le gérant
      // note au matin le transport de la veille, et la dépense doit peser sur le
      // jour où l'argent est sorti (§39).
      sql`
      SELECT category,
             COALESCE(SUM(amount), 0)::float8 AS amount,
             COUNT(*)::int AS count
        FROM expenses
       WHERE business_id = ${businessId}
         AND (${fromDate}::date IS NULL OR spent_on >= ${fromDate})
         AND (${toDate}::date IS NULL OR spent_on <= ${toDate})
       GROUP BY category
       ORDER BY amount DESC
    `,
      // Ventes en stock et ventes hors stock tombent dans les mêmes tranches :
      // découper deux rapports distincts obligerait le gérant à additionner
      // lui-même deux tableaux pour retrouver le total affiché en tête.
      //
      // `date_trunc` tronque dans le fuseau de la session Postgres, et les
      // bornes sont calculées dans celui du serveur d'application. Les deux sont
      // UTC en production ; c'est l'hypothèse tenue ici, la même que celle du
      // tableau de bord (§8).
      sql`
      WITH flux AS (
        SELECT date_trunc(${granularity}::text, created_at) AS bucket,
               1 AS sales_count, 0 AS oos_count,
               total AS revenue, cost_of_goods AS cost
          FROM sales
         WHERE business_id = ${businessId}
           AND status = 'COMPLETED'
           AND (${from}::timestamptz IS NULL OR created_at >= ${from})
           AND (${to}::timestamptz IS NULL OR created_at <= ${to})
        UNION ALL
        SELECT date_trunc(${granularity}::text, created_at),
               0, 1,
               selling_price * quantity,
               selling_price * quantity - gross_margin
          FROM out_of_stock_sales
         WHERE business_id = ${businessId}
           AND status <> 'CANCELLED'
           AND (${from}::timestamptz IS NULL OR created_at >= ${from})
           AND (${to}::timestamptz IS NULL OR created_at <= ${to})
      )
      SELECT bucket,
             SUM(sales_count)::int AS sales_count,
             SUM(oos_count)::int AS oos_count,
             SUM(revenue)::float8 AS revenue,
             SUM(cost)::float8 AS cost,
             (SUM(revenue) - SUM(cost))::float8 AS margin
        FROM flux
       GROUP BY bucket
       ORDER BY bucket DESC
       LIMIT 400
    `,
      // La remise porte sur la vente entière : `total / subtotal` la répartit au
      // prorata du montant de chaque ligne (§39). Sans ce facteur, la somme des
      // produits dépasserait le chiffre d'affaires réellement encaissé.
      sql`
      WITH lignes AS (
        SELECT i.product_id, i.product_name,
               i.quantity * i.unit_factor AS quantity,
               i.line_total * CASE WHEN s.subtotal > 0 THEN s.total / s.subtotal ELSE 0 END
                 AS revenue,
               i.quantity * i.unit_cost AS cost,
               0::numeric AS oos_quantity, 0::numeric AS oos_revenue, 0::numeric AS oos_margin
          FROM sale_items i
          JOIN sales s ON s.id = i.sale_id
         WHERE s.business_id = ${businessId}
           AND s.status = 'COMPLETED'
           AND (${from}::timestamptz IS NULL OR s.created_at >= ${from})
           AND (${to}::timestamptz IS NULL OR s.created_at <= ${to})
        UNION ALL
        SELECT o.product_id, o.product_name,
               0::numeric, 0::numeric, 0::numeric,
               o.quantity,
               o.selling_price * o.quantity,
               o.gross_margin
          FROM out_of_stock_sales o
         WHERE o.business_id = ${businessId}
           AND o.status <> 'CANCELLED'
           AND (${from}::timestamptz IS NULL OR o.created_at >= ${from})
           AND (${to}::timestamptz IS NULL OR o.created_at <= ${to})
      )
      SELECT l.product_id, l.product_name, p.base_unit,
             SUM(l.quantity)::float8 AS quantity,
             SUM(l.revenue)::float8 AS revenue,
             SUM(l.cost)::float8 AS cost,
             SUM(l.oos_quantity)::float8 AS oos_quantity,
             SUM(l.oos_revenue)::float8 AS oos_revenue,
             SUM(l.oos_margin)::float8 AS oos_margin
        FROM lignes l
        LEFT JOIN products p ON p.id = l.product_id AND p.business_id = ${businessId}
       GROUP BY l.product_id, l.product_name, p.base_unit
       ORDER BY (SUM(l.revenue) + SUM(l.oos_revenue)) DESC
       LIMIT ${PRODUCT_LIMIT}
    `,
      sql`
      SELECT COUNT(*)::int AS count FROM (
        SELECT i.product_id, i.product_name
          FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.business_id = ${businessId} AND s.status = 'COMPLETED'
           AND (${from}::timestamptz IS NULL OR s.created_at >= ${from})
           AND (${to}::timestamptz IS NULL OR s.created_at <= ${to})
        UNION
        SELECT o.product_id, o.product_name
          FROM out_of_stock_sales o
         WHERE o.business_id = ${businessId} AND o.status <> 'CANCELLED'
           AND (${from}::timestamptz IS NULL OR o.created_at >= ${from})
           AND (${to}::timestamptz IS NULL OR o.created_at <= ${to})
      ) vendus
    `,
    ]);

  const sales = one<SalesAggregate>(salesRow) ?? { count: 0, revenue: 0, cost: 0 };
  const oos = one<OutOfStockAggregate>(oosRow) ?? { count: 0, revenue: 0, margin: 0 };
  const expensesByCategory = rows<ExpenseBucket>(expenseRows);

  const expenses = round2(expensesByCategory.reduce((sum, bucket) => sum + bucket.amount, 0));
  const expenseCount = expensesByCategory.reduce((sum, bucket) => sum + bucket.count, 0);
  // L'achat de stock sort de la caisse sans être une charge de la période : la
  // marchandise est déjà comptée au coût des marchandises vendues (§39, §40).
  const stockPurchases = round2(
    expensesByCategory
      .filter((bucket) => !isOperating(bucket.category))
      .reduce((sum, bucket) => sum + bucket.amount, 0)
  );

  // Les recettes hors vente du §42. `revenueShare` écarte les remboursements de
  // dette : l'argent entre, mais la vente a été comptée le jour où elle a eu
  // lieu, et la recompter ici ferait vendre deux fois le même sac de ciment.
  const incomeBuckets: IncomeBucket[] = await incomesByCategory(businessId, { fromDate, toDate });

  const totals = periodTotals({
    salesRevenue: sales.revenue,
    salesCost: sales.cost,
    outOfStockRevenue: oos.revenue,
    outOfStockMargin: oos.margin,
    expenses,
    stockPurchases,
    otherRevenue: revenueShare(incomeBuckets),
  });

  const buckets: PeriodBucket[] = rows<BucketRow>(bucketRows).map((row) => ({
    bucket: new Date(row.bucket).toISOString(),
    salesCount: row.sales_count,
    outOfStockCount: row.oos_count,
    revenue: round2(row.revenue),
    cost: round2(row.cost),
    margin: round2(row.margin),
  }));

  const products: ProductProfit[] = rows<ProductRowAggregate>(productRows).map((row) => {
    const revenue = round2(row.revenue + row.oos_revenue);
    const cost = round2(row.cost + (row.oos_revenue - row.oos_margin));
    const margin = round2(revenue - cost);
    return {
      productId: row.product_id,
      productName: row.product_name,
      baseUnit: row.base_unit,
      quantity: row.quantity,
      revenue,
      cost,
      margin,
      marginRate: marginRate(margin, revenue),
      outOfStockQuantity: row.oos_quantity,
      outOfStockRevenue: round2(row.oos_revenue),
      outOfStockMargin: round2(row.oos_margin),
    };
  });

  return {
    from,
    to,
    granularity,
    totals,
    salesCount: sales.count,
    outOfStockCount: oos.count,
    expenseCount,
    expensesByCategory,
    buckets,
    products,
    productCount: one<{ count: number }>(productCountRow)?.count ?? products.length,
  };
}
