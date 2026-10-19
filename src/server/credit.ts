import { getSql, one, rows, runTransaction } from '../lib/db';
import { badRequest, conflict } from '../lib/http';
import { newId } from '../lib/ids';
import { enumValue, num, str } from '../lib/validate';
import { allocateRepayment, rankDebtors, saleBalance, tooMuch, totalOwed } from '../domain/credit';
import { PAYMENT_METHODS, paymentStatusOf } from '../domain/sale';
import { getContact } from './contacts';
import { round2 } from '../utils/money';
import type { OpenSale } from '../domain/credit';
import type {
  ContactRow,
  CustomerAccount,
  CustomerPaymentRow,
  CustomerSaleRow,
  DebtorRow,
  Session,
} from '@/types';

/**
 * Carnet de crédit (§45).
 *
 * Une dette, ici, n'est pas une écriture à part : c'est une vente dont
 * `amount_paid` est inférieur à `total`. Ce choix est le cœur du module, et il
 * mérite d'être dit, car la tentation inverse est forte — créer une table
 * `debts` et l'alimenter en parallèle.
 *
 * S'en priver a trois conséquences, toutes bonnes. La dette ne peut pas
 * diverger de la vente qui l'a créée, puisqu'elle s'en déduit. Un remboursement
 * est un encaissement comme un autre : il entre dans `payments`, donc dans le
 * journal de caisse (§40) le jour où l'argent est entré, sans une ligne de code
 * de plus. Et le chiffre d'affaires du §39, qui compte les ventes et non les
 * encaissements, ne bouge pas quand une vieille dette est soldée — ce serait
 * la compter deux fois.
 *
 * Seules les ventes `COMPLETED` portent une dette : une vente annulée (§25) a
 * rendu l'argent et la marchandise.
 */

const SALE_COLUMNS = `
  id, reference, invoice_reference, total::float8 AS total,
  amount_paid::float8 AS amount_paid, payment_status, created_at
`;

/** Les ventes impayées d'un client, de la plus ancienne à la plus récente. */
async function openSalesOf(businessId: string, customerId: string): Promise<OpenSale[]> {
  return rows<OpenSale>(
    await getSql()`
      SELECT id, reference, total::float8 AS total,
             amount_paid::float8 AS amount_paid, created_at
        FROM sales
       WHERE business_id = ${businessId}
         AND customer_id = ${customerId}
         AND status = 'COMPLETED'
         AND amount_paid < total
       ORDER BY created_at
    `
  );
}

/**
 * La fiche d'un client : ce qu'il a acheté, ce qu'il doit, et l'histoire de sa
 * dette.
 *
 * « Total acheté » ne compte que les ventes du §12. Les ventes hors stock
 * (§16) en sont absentes à dessein : elles n'enregistrent aucun encaissement et
 * peuvent n'avoir jamais été livrées — les additionner gonflerait un chiffre
 * que le gérant ne pourrait rapprocher d'aucune facture.
 */
export async function customerAccount(
  businessId: string,
  customerId: string
): Promise<CustomerAccount> {
  const customer = (await getContact(businessId, 'customers', customerId)) as ContactRow;
  const sql = getSql();

  const [ventes, encaissements] = await Promise.all([
    rows<CustomerSaleRow>(
      await sql`
        SELECT ${sql.unsafe(SALE_COLUMNS)}, status
          FROM sales
         WHERE business_id = ${businessId} AND customer_id = ${customerId}
         ORDER BY created_at DESC
         LIMIT 100
      `
    ),
    rows<CustomerPaymentRow>(
      await sql`
        SELECT p.id, p.amount::float8 AS amount, p.method, p.kind, p.note,
               p.created_at, s.reference AS sale_reference
          FROM payments p
          JOIN sales s ON s.id = p.sale_id
         WHERE p.business_id = ${businessId}
           AND s.customer_id = ${customerId}
           AND s.status = 'COMPLETED'
         ORDER BY p.created_at DESC
         LIMIT 100
      `
    ),
  ]);

  const actives = ventes.filter((vente) => vente.status === 'COMPLETED');
  const spent = round2(actives.reduce((somme, vente) => somme + vente.total, 0));
  const open = actives.filter((vente) => saleBalance(vente.total, vente.amount_paid) > 0);

  return {
    customer,
    spent,
    owed: totalOwed(open),
    openCount: open.length,
    // `ventes` est rendu du plus récent au plus ancien : la plus vieille
    // ardoise est donc la dernière de la liste, et non la première.
    oldestOpenAt: open.length ? (open[open.length - 1]?.created_at ?? null) : null,
    sales: ventes,
    payments: encaissements,
  };
}

/**
 * Encaisse un remboursement et l'impute aux ventes impayées.
 *
 * Le gérant saisit une somme, pas une répartition : au comptoir, le client pose
 * un billet sur le carnet, il ne désigne pas une facture. L'imputation suit
 * donc la règle du cahier — la plus vieille ardoise d'abord — et laisse une
 * trace par vente, pour que l'historique reste relisible.
 *
 * Tout est écrit dans une seule transaction : un remboursement qui aurait mis à
 * jour deux ventes sur trois laisserait un solde faux, et personne ne saurait
 * lequel.
 */
export async function recordRepayment(
  session: Session,
  customerId: string,
  body: Record<string, unknown>
): Promise<CustomerAccount> {
  const amount = round2(num(body.amount, 'montant', { min: 0.01 }));
  const method = enumValue(body.method || 'CASH', 'moyen de paiement', PAYMENT_METHODS);
  const note = str(body.note, 'motif', { required: false, max: 300 });

  await getContact(session.businessId, 'customers', customerId);
  const open = await openSalesOf(session.businessId, customerId);
  const owed = totalOwed(open);

  if (owed <= 0) throw conflict('Ce client ne doit rien : il n’y a pas de remboursement à saisir.');
  if (tooMuch(amount, owed)) {
    throw conflict(
      `Le versement dépasse la dette : il reste ${owed.toLocaleString('fr-FR')} à régler.`
    );
  }

  const parts = allocateRepayment(amount, open);
  // Garde-fou : l'imputation doit replacer exactement ce qui a été versé.
  // Un écart signifierait que la dette a bougé entre la lecture et l'écriture.
  const impute = round2(parts.reduce((somme, part) => somme + part.amount, 0));
  if (impute !== amount)
    throw conflict('La dette a changé pendant la saisie. Reprenez le montant.');

  const sql = getSql();
  await runTransaction(
    parts.flatMap((part) => {
      const vente = open.find((une) => une.id === part.saleId);
      const statut = paymentStatusOf(round2(vente?.total ?? 0), part.amountPaid);
      return [
        sql`
          UPDATE sales
             SET amount_paid = ${part.amountPaid}, payment_status = ${statut}, updated_at = now()
           WHERE id = ${part.saleId} AND business_id = ${session.businessId}
        `,
        sql`
          INSERT INTO payments (id, business_id, sale_id, method, amount, kind, note, user_id)
          VALUES (${newId('pay')}, ${session.businessId}, ${part.saleId}, ${method},
                  ${part.amount}, 'REPAYMENT', ${note}, ${session.userId})
        `,
      ];
    })
  );

  return customerAccount(session.businessId, customerId);
}

/**
 * Les clients qui doivent, du plus gros au plus petit.
 *
 * Le classement est fait en SQL parce qu'il porte sur toutes les ventes de la
 * boutique ; sa mise en forme — les parts de barre, la limite — reste au
 * domaine, où elle est testée.
 */
export async function debtors(businessId: string, limit = 5) {
  const lignes = rows<DebtorRow>(
    await getSql()`
      SELECT c.id, c.name, c.phone,
             SUM(s.total - s.amount_paid)::float8 AS owed,
             FLOOR(EXTRACT(EPOCH FROM (now() - MIN(s.created_at))) / 86400)::int AS oldest_days
        FROM customers c
        JOIN sales s ON s.customer_id = c.id AND s.business_id = c.business_id
       WHERE c.business_id = ${businessId}
         AND s.status = 'COMPLETED'
         AND s.amount_paid < s.total
       GROUP BY c.id, c.name, c.phone
       ORDER BY owed DESC
    `
  );

  const classes = rankDebtors(
    lignes.map((ligne) => ({
      id: ligne.id,
      name: ligne.name,
      phone: ligne.phone,
      owed: round2(ligne.owed),
      oldestDays: ligne.oldest_days,
    })),
    limit
  );

  return {
    debtors: classes,
    // Le total porte sur *tous* les débiteurs, pas seulement ceux affichés :
    // « 5 clients doivent 240 000 » ne doit pas changer parce que le classement
    // n'en montre que trois.
    totalOwed: round2(lignes.reduce((somme, ligne) => somme + ligne.owed, 0)),
    debtorCount: lignes.length,
  };
}

/** Ventes à crédit encore ouvertes, tous clients confondus (§45). */
export async function openCredit(businessId: string) {
  const ligne = one<{ owed: number; count: number }>(
    await getSql()`
      SELECT COALESCE(SUM(total - amount_paid), 0)::float8 AS owed,
             COUNT(*)::int AS count
        FROM sales
       WHERE business_id = ${businessId} AND status = 'COMPLETED' AND amount_paid < total
    `
  );
  if (!ligne) throw badRequest('Solde des crédits indisponible.');
  return { owed: round2(ligne.owed), count: ligne.count };
}
