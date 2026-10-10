import { getSql, one, rows } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, notFound } from '../lib/http';
import { str, num, enumValue } from '../lib/validate';
import { round2 } from '../utils/money';
import { EXPENSE_CATEGORIES } from '../domain/report';
import type { ExpenseRow, Receipt, Session } from '@/types';

/**
 * Dépenses de la boutique (§39).
 *
 * C'est la pièce sans laquelle « bénéfice net » n'est qu'un mot : la marge brute
 * ne déduit que les marchandises (§13), et transport, salaires, loyer et pertes
 * ne se déduisent que s'ils sont notés quelque part.
 *
 * Aucun mouvement de stock n'est écrit ici, y compris pour une perte. La perte
 * de marchandise se constate en stock par un ajustement (§26), qui a sa propre
 * trace ; ce qu'on enregistre ici est l'argent qu'elle a coûté. Les deux écrire
 * depuis le même geste ferait sortir deux fois la même casse — une fois du
 * stock, une fois du résultat — sans qu'on puisse dire laquelle est la bonne.
 */

/**
 * Colonnes d'une dépense, image du justificatif exclue.
 *
 * `has_receipt` dit qu'un reçu existe ; l'image reste en base. Une liste de
 * trente dépenses porterait sinon trente photos, soit plusieurs mégaoctets sur
 * la connexion que QuincaFlow doit ménager (§35, §40).
 */
const COLUMNS = `
  e.id, e.business_id, e.category, e.label, e.amount::float8 AS amount,
  to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, e.note, e.user_id, e.created_at,
  EXISTS (
    SELECT 1 FROM documents d
     WHERE d.business_id = e.business_id
       AND d.reference_type = 'EXPENSE' AND d.reference_id = e.id
  ) AS has_receipt
`;

/**
 * Bornes de la période, en dates civiles.
 *
 * `spent_on` est une `date` : la comparer à un horodatage ferait intervenir le
 * fuseau de la session Postgres, et une dépense du 1er basculerait au 31 selon
 * l'endroit d'où la requête part.
 */
export interface DateRange {
  fromDate?: string | null;
  toDate?: string | null;
}

export async function listExpenses(
  businessId: string,
  { fromDate, toDate, limit = 100 }: DateRange & { limit?: number } = {}
): Promise<ExpenseRow[]> {
  const sql = getSql();
  return rows<ExpenseRow>(
    await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM expenses e
     WHERE e.business_id = ${businessId}
       AND (${fromDate ?? null}::date IS NULL OR e.spent_on >= ${fromDate ?? null})
       AND (${toDate ?? null}::date IS NULL OR e.spent_on <= ${toDate ?? null})
     ORDER BY e.spent_on DESC, e.created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `
  );
}

export async function getExpense(businessId: string, id: string): Promise<ExpenseRow> {
  const sql = getSql();
  const row = one<ExpenseRow>(
    await sql`
      SELECT ${sql.unsafe(COLUMNS)} FROM expenses e
       WHERE e.id = ${id} AND e.business_id = ${businessId}
    `
  );
  if (!row) throw notFound('Dépense introuvable.');
  return row;
}

/** Lit les champs communs à la création et à la correction d'une dépense. */
function fieldsOf(body: Record<string, unknown>) {
  return {
    category: enumValue(body.category, 'poste de dépense', EXPENSE_CATEGORIES),
    label: str(body.label, 'libellé', { max: 160 }),
    amount: round2(num(body.amount, 'montant', { min: 0 })),
    // Date laissée vide : c'est aujourd'hui. `null` fait retomber l'instruction
    // sur CURRENT_DATE, calculé par Postgres.
    spentOn: str(body.spentOn, 'date de la dépense', { required: false, max: 10 }),
    note: str(body.note, 'note', { required: false, max: 500 }),
  };
}

export async function createExpense(session: Session, body: Record<string, unknown>) {
  const fields = fieldsOf(body);
  const id = newId('exp');

  await getSql()`
    INSERT INTO expenses (id, business_id, category, label, amount, spent_on, note, user_id)
    VALUES (
      ${id}, ${session.businessId}, ${fields.category}, ${fields.label}, ${fields.amount},
      COALESCE(${fields.spentOn}::date, CURRENT_DATE), ${fields.note}, ${session.userId}
    )
  `;

  return getExpense(session.businessId, id);
}

export async function updateExpense(session: Session, id: string, body: Record<string, unknown>) {
  await getExpense(session.businessId, id);
  const fields = fieldsOf(body);

  await getSql()`
    UPDATE expenses
       SET category = ${fields.category},
           label = ${fields.label},
           amount = ${fields.amount},
           spent_on = COALESCE(${fields.spentOn}::date, spent_on),
           note = ${fields.note},
           updated_at = now()
     WHERE id = ${id} AND business_id = ${session.businessId}
  `;

  return getExpense(session.businessId, id);
}

/**
 * Supprime une dépense et son justificatif.
 *
 * Contrairement à un produit (§9) ou à une vente (§25), une dépense est bel et
 * bien supprimée : elle ne porte aucun document remis à un tiers. Une dépense
 * saisie par erreur qui resterait « annulée » dans une liste ferait douter de
 * tous les autres montants.
 *
 * Le reçu part avec elle, et il faut le dire explicitement : `documents` désigne
 * sa cible par un `reference_id` libre, sans clé étrangère — c'est ce qui lui
 * permet de servir aussi bien une commande fournisseur qu'une dépense (§20).
 * Postgres ne peut donc pas cascader, et la photo survivrait à sa dépense.
 */
export async function deleteExpense(session: Session, id: string): Promise<{ id: string }> {
  await getExpense(session.businessId, id);
  const sql = getSql();
  await sql.transaction([
    sql`
      DELETE FROM documents
       WHERE business_id = ${session.businessId}
         AND reference_type = 'EXPENSE' AND reference_id = ${id}
    `,
    sql`DELETE FROM expenses WHERE id = ${id} AND business_id = ${session.businessId}`,
  ]);
  return { id };
}

// ───────────────────────── Justificatifs (§40) ─────────────────────────────

/**
 * Taille maximale d'un justificatif, une fois encodé en base64.
 *
 * L'écran réduit déjà l'image avant l'envoi ; cette borne est le garde-fou du
 * serveur, qui ne fait jamais confiance au client (§35). Environ 600 Ko encodés,
 * soit à peu près 450 Ko d'image — largement de quoi lire un reçu manuscrit.
 */
const RECEIPT_MAX_LENGTH = 600_000;

/** Seules ces images sont acceptées : un reçu est une photo, pas un exécutable. */
const RECEIPT_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
];

/**
 * Joint ou remplace le justificatif d'une dépense.
 *
 * L'image est rangée dans `documents`, avec les bons de commande et les factures
 * fournisseurs (§20) : c'est la même notion de pièce jointe, et lui donner sa
 * propre table aurait dupliqué la contrainte de cloisonnement.
 *
 * Elle est stockée en `data:` URL faute de stockage d'objets configuré. Le choix
 * est assumé et borné : une seule image par dépense, réduite, jamais chargée en
 * liste. Le jour où un stockage d'objets existe, seule la valeur de `url` change.
 */
export async function attachReceipt(
  session: Session,
  expenseId: string,
  body: Record<string, unknown>
): Promise<Receipt> {
  await getExpense(session.businessId, expenseId);

  const url = typeof body.image === 'string' ? body.image.trim() : '';
  if (!url) throw badRequest('Aucune image reçue.');
  if (!RECEIPT_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    throw badRequest('Le justificatif doit être une photo (JPEG, PNG ou WebP).');
  }
  if (url.length > RECEIPT_MAX_LENGTH) {
    throw badRequest('Photo trop lourde. Reprenez-la de moins près ou choisissez-en une autre.');
  }

  const name = str(body.name, 'nom du fichier', { required: false, max: 160 }) || 'Reçu';
  const id = newId('doc');

  // Un seul justificatif par dépense : le nouveau remplace l'ancien plutôt que
  // de s'empiler, sans quoi trois photos du même reçu s'accumuleraient sans
  // qu'aucun écran ne sache laquelle montrer.
  await getSql().transaction([
    getSql()`
      DELETE FROM documents
       WHERE business_id = ${session.businessId}
         AND reference_type = 'EXPENSE' AND reference_id = ${expenseId}
    `,
    getSql()`
      INSERT INTO documents (id, business_id, kind, reference_type, reference_id, name, url)
      VALUES (${id}, ${session.businessId}, 'RECEIPT', 'EXPENSE', ${expenseId}, ${name}, ${url})
    `,
  ]);

  return { id, name, url, created_at: new Date().toISOString() };
}

/** Lit le justificatif d'une dépense, image comprise. */
export async function getReceipt(businessId: string, expenseId: string): Promise<Receipt> {
  await getExpense(businessId, expenseId);
  const row = one<Receipt>(
    await getSql()`
      SELECT id, name, url, created_at FROM documents
       WHERE business_id = ${businessId}
         AND reference_type = 'EXPENSE' AND reference_id = ${expenseId}
       ORDER BY created_at DESC LIMIT 1
    `
  );
  if (!row) throw notFound('Aucun justificatif pour cette dépense.');
  return row;
}

export async function deleteReceipt(session: Session, expenseId: string): Promise<{ id: string }> {
  await getReceipt(session.businessId, expenseId);
  await getSql()`
    DELETE FROM documents
     WHERE business_id = ${session.businessId}
       AND reference_type = 'EXPENSE' AND reference_id = ${expenseId}
  `;
  return { id: expenseId };
}
