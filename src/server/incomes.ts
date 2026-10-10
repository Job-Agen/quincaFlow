import { getSql, one, rows } from '../lib/db';
import { newId } from '../lib/ids';
import { notFound } from '../lib/http';
import { str, num, enumValue } from '../lib/validate';
import { round2 } from '../utils/money';
import { INCOME_CATEGORIES, bookTotals, mergeDays, revenueShare } from '../domain/income';
import type { IncomeBucket, IncomeRow, Session, TakingsBook } from '@/types';
import type { DateRange } from './expenses';

/**
 * Cahier de recettes (§42).
 *
 * Deux choses vivent ici : les encaissements hors vente, saisis à la main, et
 * l'assemblage du cahier — les journées, nourries à la fois par ces saisies et
 * par les encaissements de vente que le §14 enregistre déjà.
 *
 * Aucune vente n'est écrite depuis ce module. Une recette hors vente ne touche
 * ni au stock ni au catalogue : c'est de l'argent qui entre pour autre chose
 * qu'une marchandise, et c'est précisément ce qui n'avait nulle part où aller.
 */

const COLUMNS = `
  i.id, i.business_id, i.category, i.label, i.amount::float8 AS amount,
  to_char(i.received_on, 'YYYY-MM-DD') AS received_on, i.note, i.user_id, i.created_at
`;

export async function listIncomes(
  businessId: string,
  { fromDate, toDate, limit = 100 }: DateRange & { limit?: number } = {}
): Promise<IncomeRow[]> {
  const sql = getSql();
  return rows<IncomeRow>(
    await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM incomes i
     WHERE i.business_id = ${businessId}
       AND (${fromDate ?? null}::date IS NULL OR i.received_on >= ${fromDate ?? null})
       AND (${toDate ?? null}::date IS NULL OR i.received_on <= ${toDate ?? null})
     ORDER BY i.received_on DESC, i.created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `
  );
}

export async function getIncome(businessId: string, id: string): Promise<IncomeRow> {
  const sql = getSql();
  const row = one<IncomeRow>(
    await sql`
      SELECT ${sql.unsafe(COLUMNS)} FROM incomes i
       WHERE i.id = ${id} AND i.business_id = ${businessId}
    `
  );
  if (!row) throw notFound('Recette introuvable.');
  return row;
}

/** Lit les champs communs à la création et à la correction d'une recette. */
function fieldsOf(body: Record<string, unknown>) {
  return {
    category: enumValue(body.category, 'poste de recette', INCOME_CATEGORIES),
    label: str(body.label, 'libellé', { max: 160 }),
    amount: round2(num(body.amount, 'montant', { min: 0 })),
    // Date laissée vide : c'est aujourd'hui, calculé par Postgres. Une recette
    // du samedi saisie le lundi appartient au samedi (§42).
    receivedOn: str(body.receivedOn, 'date de la recette', { required: false, max: 10 }),
    note: str(body.note, 'note', { required: false, max: 500 }),
  };
}

export async function createIncome(session: Session, body: Record<string, unknown>) {
  const fields = fieldsOf(body);
  const id = newId('inc');

  await getSql()`
    INSERT INTO incomes (id, business_id, category, label, amount, received_on, note, user_id)
    VALUES (
      ${id}, ${session.businessId}, ${fields.category}, ${fields.label}, ${fields.amount},
      COALESCE(${fields.receivedOn}::date, CURRENT_DATE), ${fields.note}, ${session.userId}
    )
  `;

  return getIncome(session.businessId, id);
}

export async function updateIncome(session: Session, id: string, body: Record<string, unknown>) {
  await getIncome(session.businessId, id);
  const fields = fieldsOf(body);

  await getSql()`
    UPDATE incomes
       SET category = ${fields.category},
           label = ${fields.label},
           amount = ${fields.amount},
           received_on = COALESCE(${fields.receivedOn}::date, received_on),
           note = ${fields.note},
           updated_at = now()
     WHERE id = ${id} AND business_id = ${session.businessId}
  `;

  return getIncome(session.businessId, id);
}

/**
 * Supprime une recette.
 *
 * Comme une dépense (§40), et pour la même raison : elle ne porte aucun document
 * remis à un tiers. Une recette saisie par erreur qui resterait « annulée » dans
 * le cahier ferait douter de tous les autres montants.
 */
export async function deleteIncome(session: Session, id: string): Promise<{ id: string }> {
  await getIncome(session.businessId, id);
  await getSql()`DELETE FROM incomes WHERE id = ${id} AND business_id = ${session.businessId}`;
  return { id };
}

/**
 * Totaux par poste sur la période — pour le cahier, et pour le §39.
 *
 * Le §39 en tire la part qui est du chiffre d'affaires, par `revenueShare` : il
 * lui faut donc le détail, pas seulement une somme.
 */
export async function incomesByCategory(
  businessId: string,
  { fromDate, toDate }: DateRange = {}
): Promise<IncomeBucket[]> {
  const sql = getSql();
  return rows<IncomeBucket>(
    await sql`
      SELECT i.category, SUM(i.amount)::float8 AS amount, COUNT(*)::int AS count
        FROM incomes i
       WHERE i.business_id = ${businessId}
         AND (${fromDate ?? null}::date IS NULL OR i.received_on >= ${fromDate ?? null})
         AND (${toDate ?? null}::date IS NULL OR i.received_on <= ${toDate ?? null})
       GROUP BY i.category
       ORDER BY amount DESC
    `
  );
}

/** Une journée telle que Postgres la rend, avant assemblage. */
interface LigneJour {
  day: string;
  amount: number;
  count: number;
}

/**
 * Le cahier d'une période (§42).
 *
 * Deux agrégats séparés plutôt qu'une union : les encaissements de vente vivent
 * dans `payments`, les recettes dans `incomes`, et les réunir en SQL obligerait
 * à inventer des colonnes communes à deux choses qui n'ont en commun que leur
 * date et leur montant. Le domaine les assemble ensuite, et c'est lui qui est
 * testé.
 *
 * Les paiements d'une vente annulée sont écartés, comme au §40 : l'argent est
 * reparti chez le client, et le compter gonflerait une recette introuvable le
 * soir dans le tiroir.
 */
export async function takingsBook(
  businessId: string,
  { fromDate, toDate }: DateRange = {}
): Promise<TakingsBook> {
  const sql = getSql();

  const [ventes, recettes, postes] = await Promise.all([
    rows<LigneJour>(
      await sql`
        SELECT to_char(p.created_at, 'YYYY-MM-DD') AS day,
               SUM(p.amount)::float8 AS amount,
               COUNT(*)::int AS count
          FROM payments p
          JOIN sales s ON s.id = p.sale_id
         WHERE p.business_id = ${businessId}
           AND s.status <> 'CANCELLED'
           AND (${fromDate ?? null}::date IS NULL OR p.created_at >= ${fromDate ?? null}::date)
           AND (${toDate ?? null}::date IS NULL OR p.created_at < (${toDate ?? null}::date + 1))
         GROUP BY 1
      `
    ),
    rows<LigneJour>(
      await sql`
        SELECT to_char(i.received_on, 'YYYY-MM-DD') AS day,
               SUM(i.amount)::float8 AS amount,
               COUNT(*)::int AS count
          FROM incomes i
         WHERE i.business_id = ${businessId}
           AND (${fromDate ?? null}::date IS NULL OR i.received_on >= ${fromDate ?? null})
           AND (${toDate ?? null}::date IS NULL OR i.received_on <= ${toDate ?? null})
         GROUP BY 1
      `
    ),
    incomesByCategory(businessId, { fromDate, toDate }),
  ]);

  const days = mergeDays(
    new Map(ventes.map((l) => [l.day, { salesAmount: l.amount, salesCount: l.count }])),
    new Map(recettes.map((l) => [l.day, { otherAmount: l.amount, otherCount: l.count }]))
  );

  const totaux = bookTotals(days);

  return {
    from: fromDate ?? null,
    to: toDate ?? null,
    salesTotal: totaux.salesTotal,
    otherTotal: totaux.otherTotal,
    otherRevenue: revenueShare(postes),
    total: totaux.total,
    days,
    byCategory: postes,
  };
}
