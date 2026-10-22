import { getSql, one, rows } from '../lib/db';
import { round2 } from '../utils/money';
import { grossMargin } from '../domain/sale';
import { lowStockProducts } from './products';
import type { DashboardDay, DashboardSummary, DashboardTopProduct, HistoryEntry } from '@/types';

/**
 * Tableau de bord (§8).
 *
 * Il répond à une seule question — « que s'est-il passé dans ma boutique
 * aujourd'hui ? » — et rien d'autre. Des chiffres, les alertes de stock et les
 * dernières opérations.
 *
 * Trois ajouts au §8, et ils ne contredisent pas son « pas de graphiques
 * complexes » : la semaine écoulée en barres, le palmarès des cinq articles les
 * plus vendus, et les créances clients. Le premier répond à « est-ce que ça
 * monte ou ça descend ? », que cinq chiffres du jour ne disent pas ; le
 * deuxième à « qu'est-ce qui fait vivre la boutique ? » ; le troisième rappelle
 * l'argent qui dort dehors (§45), qu'on oublie précisément parce qu'il
 * n'apparaît nulle part.
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

/** Les sept derniers jours, celui-ci compris. */
function week(): { from: string } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  return { from: from.toISOString() };
}

export async function dashboard(businessId: string): Promise<DashboardSummary> {
  const sql = getSql();
  const { start, end } = today();
  const { from: weekStart } = week();

  const [salesRow, oosRow, recentSales, recentOos, lowStock, weekRows, topRows, owedRow] =
    await Promise.all([
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

      // La semaine écoulée, un seau par jour. `generate_series` fournit les sept
      // jours, y compris ceux sans vente : un trou dans la série ferait lire une
      // baisse là où il n'y a qu'une absence de donnée.
      // (Aucun accent grave dans le SQL ci-dessous : il fermerait le gabarit.)
      sql`
      SELECT to_char(j.jour, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(s.total), 0)::float8 AS revenue,
             COUNT(s.id)::int AS count
        FROM generate_series(${weekStart}::date, ${start}::date, interval '1 day') AS j(jour)
        LEFT JOIN sales s
               ON s.business_id = ${businessId}
              AND s.status = 'COMPLETED'
              AND s.created_at >= j.jour
              -- Un intervalle, et non + 1 : generate_series sur un intervalle
              -- rend des timestamps, auxquels on n'ajoute pas un entier.
              AND s.created_at < j.jour + interval '1 day'
       GROUP BY j.jour
       ORDER BY j.jour
    `,

      // Le palmarès porte sur la semaine, pas sur toute l'histoire : ce qui se
      // vendait bien l'an dernier n'aide pas à décider du réassort de demain.
      sql`
      SELECT i.product_name AS name,
             SUM(i.quantity * i.unit_factor)::float8 AS quantity,
             SUM(i.line_total)::float8 AS revenue
        FROM sale_items i
        JOIN sales s ON s.id = i.sale_id
       WHERE i.business_id = ${businessId}
         AND s.status = 'COMPLETED'
         AND s.created_at >= ${weekStart}
       GROUP BY i.product_name
       ORDER BY revenue DESC
       LIMIT 5
    `,

      // Ce que les clients doivent, toutes ventes non soldées confondues (§45).
      sql`
      SELECT COALESCE(SUM(total - amount_paid), 0)::float8 AS owed,
             COUNT(DISTINCT customer_id)::int AS customers
        FROM sales
       WHERE business_id = ${businessId} AND status = 'COMPLETED' AND amount_paid < total
    `,
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

  const owed = one<{ owed: number; customers: number }>(owedRow) ?? { owed: 0, customers: 0 };

  return {
    revenue: round2(sales.revenue),
    margin,
    salesCount: sales.count,
    outOfStockCount: oos.count,
    outOfStockRevenue: round2(oos.revenue),
    lowStockCount: lowStock.length,
    lowStock,
    recent: activity,
    week: rows<DashboardDay>(weekRows).map((jour) => ({
      ...jour,
      revenue: round2(jour.revenue),
    })),
    topProducts: rows<DashboardTopProduct>(topRows).map((produit) => ({
      ...produit,
      revenue: round2(produit.revenue),
    })),
    receivables: round2(owed.owed),
    debtorCount: owed.customers,
  };
}
