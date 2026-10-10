import { getSql, one, rows } from '../lib/db';
import { round2 } from '../utils/money';
import { PAYMENT_METHOD_LABELS } from '../domain/sale';
import { EXPENSE_CATEGORY_LABELS } from '../domain/report';
import { INCOME_CATEGORY_LABELS } from '../domain/income';
import type {
  CashEntry,
  CashEntryWithBalance,
  CashJournal,
  ExpenseCategory,
  IncomeCategory,
  PaymentMethod,
} from '@/types';

/**
 * Journal de caisse (§40).
 *
 * Le §39 répond à « combien ai-je gagné ? ». Celui-ci répond à « où est passé
 * l'argent ? », et les deux réponses peuvent tout à fait diverger : un mois de
 * gros réassort vide la caisse tout en étant rentable.
 *
 * Trois choix méritent d'être dits :
 *
 * — **Les encaissements, pas les ventes.** Une entrée du journal est une ligne
 *   de `payments`, non une vente. Une vente à moitié payée n'a fait entrer que
 *   la moitié, et c'est cette moitié que le tiroir contient.
 * — **Rien d'une vente annulée** (§25). L'argent est revenu au client ; le
 *   compter en entrée gonflerait une caisse introuvable.
 * — **Les pertes ne sont pas des sorties.** Aucun argent ne quitte le tiroir
 *   quand une vitre se brise : c'est un ajustement de stock (§26). Il n'existe
 *   donc pas de poste « pertes » parmi les dépenses.
 */

/** Au-delà, le journal est tronqué et le dit (§40). */
const ENTRY_LIMIT = 300;

interface CashRow {
  id: string;
  direction: 'IN' | 'OUT';
  kind: 'SALE_PAYMENT' | 'INCOME' | 'EXPENSE';
  occurred_at: string;
  label: string;
  /** Moyen de paiement ou poste de dépense, à traduire en libellé lisible. */
  code: string;
  amount: number;
  reference: string | null;
  sale_id: string | null;
}

/** Libellé du moyen ou du poste, sans jamais afficher un code brut au gérant. */
function detailOf(row: CashRow): string {
  if (row.kind === 'SALE_PAYMENT') {
    return PAYMENT_METHOD_LABELS[row.code as PaymentMethod] ?? 'Encaissement';
  }
  if (row.kind === 'INCOME') {
    return INCOME_CATEGORY_LABELS[row.code as IncomeCategory] ?? 'Divers';
  }
  return EXPENSE_CATEGORY_LABELS[row.code as ExpenseCategory] ?? 'Divers';
}

export async function cashJournal(
  businessId: string,
  {
    from = null,
    to = null,
    fromDate = null,
    toDate = null,
    direction,
  }: {
    from?: string | null;
    to?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    /** Filtre d'affichage. Les totaux, eux, portent toujours sur les deux sens. */
    direction?: 'IN' | 'OUT';
  } = {}
): Promise<CashJournal> {
  const sql = getSql();

  const sources = sql`
    WITH caisse AS (
      SELECT p.id, 'IN' AS direction, 'SALE_PAYMENT' AS kind,
             p.created_at AS occurred_at,
             COALESCE('Vente ' || s.reference, 'Encaissement') AS label,
             p.method AS code, p.amount::float8 AS amount,
             s.reference, s.id AS sale_id
        FROM payments p
        JOIN sales s ON s.id = p.sale_id
       WHERE p.business_id = ${businessId}
         -- Une vente annulée n'a rien laissé dans le tiroir (§25, §40).
         AND s.status = 'COMPLETED'
         AND (${from}::timestamptz IS NULL OR p.created_at >= ${from})
         AND (${to}::timestamptz IS NULL OR p.created_at <= ${to})

      UNION ALL
      -- Les recettes hors vente (§42) : le troisième filet d'entrée. Datées du
      -- jour où l'argent est entré, comme les dépenses le sont du jour où il
      -- est sorti. Un remboursement de dette y figure — il entre bien en
      -- caisse —, même s'il ne compte pas au chiffre d'affaires du §39.
      SELECT i.id, 'IN', 'INCOME',
             (i.received_on + i.created_at::time)::timestamptz,
             i.label, i.category, i.amount::float8,
             NULL, NULL
        FROM incomes i
       WHERE i.business_id = ${businessId}
         AND (${fromDate}::date IS NULL OR i.received_on >= ${fromDate})
         AND (${toDate}::date IS NULL OR i.received_on <= ${toDate})

      UNION ALL
      -- La dépense est datée du jour où l'argent est sorti, et l'heure de saisie
      -- ne sert qu'à départager deux dépenses du même jour.
      SELECT e.id, 'OUT', 'EXPENSE',
             (e.spent_on + e.created_at::time)::timestamptz,
             e.label, e.category, e.amount::float8,
             NULL, NULL
        FROM expenses e
       WHERE e.business_id = ${businessId}
         AND (${fromDate}::date IS NULL OR e.spent_on >= ${fromDate})
         AND (${toDate}::date IS NULL OR e.spent_on <= ${toDate})
    )
    SELECT * FROM caisse
     WHERE (${direction ?? null}::text IS NULL OR direction = ${direction ?? null})
     ORDER BY occurred_at DESC, id DESC
     LIMIT ${ENTRY_LIMIT + 1}
  `;

  // Les totaux ignorent le filtre de sens et la limite : le solde de la période
  // ne doit pas changer selon ce que l'écran affiche.
  const sums = sql`
    SELECT COALESCE(SUM(p.amount), 0)::float8
             + (SELECT COALESCE(SUM(i.amount), 0)::float8
                  FROM incomes i
                 WHERE i.business_id = ${businessId}
                   AND (${fromDate}::date IS NULL OR i.received_on >= ${fromDate})
                   AND (${toDate}::date IS NULL OR i.received_on <= ${toDate})) AS cash_in,
           (SELECT COALESCE(SUM(e.amount), 0)::float8
              FROM expenses e
             WHERE e.business_id = ${businessId}
               AND (${fromDate}::date IS NULL OR e.spent_on >= ${fromDate})
               AND (${toDate}::date IS NULL OR e.spent_on <= ${toDate})) AS cash_out
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
     WHERE p.business_id = ${businessId}
       AND s.status = 'COMPLETED'
       AND (${from}::timestamptz IS NULL OR p.created_at >= ${from})
       AND (${to}::timestamptz IS NULL OR p.created_at <= ${to})
  `;

  const [result, totals] = await Promise.all([sources, sums]);

  const raw = rows<CashRow>(result);
  const truncated = raw.length > ENTRY_LIMIT;
  const kept = truncated ? raw.slice(0, ENTRY_LIMIT) : raw;

  const entries: CashEntry[] = kept.map((row) => ({
    id: row.id,
    direction: row.direction,
    kind: row.kind,
    occurredAt: new Date(row.occurred_at).toISOString(),
    label: row.label,
    detail: detailOf(row),
    amount: round2(row.amount),
    reference: row.reference,
    saleId: row.sale_id,
  }));

  const sum = one<{ cash_in: number; cash_out: number }>(totals) ?? { cash_in: 0, cash_out: 0 };
  const cashIn = round2(sum.cash_in);
  const cashOut = round2(sum.cash_out);

  return {
    from,
    to,
    cashIn,
    cashOut,
    balance: round2(cashIn - cashOut),
    entries: withRunningBalance(entries),
    truncated,
  };
}

/**
 * Attache à chaque ligne le solde qui la suit.
 *
 * Les lignes arrivent du plus récent au plus ancien, comme le gérant les lit. Le
 * solde courant, lui, se construit dans l'ordre inverse : on part de la plus
 * ancienne, on cumule, puis on remet la liste dans le sens de lecture. Calculé
 * dans le sens de l'affichage, le solde décroîtrait vers le passé — et la
 * première ligne porterait le solde de la dernière opération seule.
 */
export function withRunningBalance(entries: CashEntry[]): CashEntryWithBalance[] {
  let running = 0;
  const oldestFirst = [...entries].reverse().map((entry) => {
    running = round2(running + (entry.direction === 'IN' ? entry.amount : -entry.amount));
    return { ...entry, balance: running };
  });
  return oldestFirst.reverse();
}
