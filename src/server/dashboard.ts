import { getSql, one, rows } from '../lib/db';
import { round2 } from '../utils/money';
import { grossMargin } from '../domain/sale';
import { lowStockProducts } from './products';
import type { DashboardSummary, HistoryEntry } from '@/types';

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
function today(): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function dashboard(businessId: string): Promise<DashboardSummary> {
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
      SELECT id, reference, total::float8 AS amount, created_at, 'SALE' AS kind
        FROM sales
       WHERE business_id = ${businessId} AND status = 'COMPLETED'
       ORDER BY created_at DESC LIMIT 8
    `,
    sql`
      SELECT id, reference, (selling_price * quantity)::float8 AS amount, created_at,
             'OUT_OF_STOCK' AS kind
        FROM out_of_stock_sales
       WHERE business_id = ${businessId} AND status <> 'CANCELLED'
       ORDER BY created_at DESC LIMIT 8
    `,
    lowStockProducts(businessId, 10),
  ]);

  const sales = one<{ count: number; revenue: number; cost: number }>(salesRow) ?? {
    count: 0,
    revenue: 0,
    cost: 0,
  };
  const oos = one<{ count: number; margin: number; revenue: number }>(oosRow) ?? {
    count: 0,
    margin: 0,
    revenue: 0,
  };

  // La marge hors stock est déjà nette de son coût d'achat : elle s'ajoute
  // directement à la marge des ventes en stock.
  const margin = round2(grossMargin(sales.revenue, sales.cost) + oos.margin);

  const activity = [...rows<HistoryEntry>(recentSales), ...rows<HistoryEntry>(recentOos)]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return {
    revenue: round2(sales.revenue),
    margin,
    salesCount: sales.count,
    outOfStockCount: oos.count,
    outOfStockRevenue: round2(oos.revenue),
    lowStockCount: lowStock.length,
    lowStock,
    recent: activity,
  };
}
