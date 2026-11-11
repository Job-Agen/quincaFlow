import { getSql, one, rows, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { notFound } from '../lib/http';
import { str, num, enumValue } from '../lib/validate';
import { round2 } from '../utils/money';
import { EXPENSE_CATEGORIES } from '../domain/report';
import { MOIS_MAX, MOIS_MIN, prochaineEcheance, type ChargeRow } from '../domain/charge';
import type { Session } from '@/types';

/**
 * Les charges qui reviennent (§66).
 *
 * Une charge n'est pas une dépense : c'est la promesse qu'il y en aura une.
 * D'où deux tables et non une — `recurring_charges` tient le calendrier,
 * `expenses` tient l'argent sorti. Payer une charge écrit **une dépense
 * ordinaire** et avance l'échéance : les rapports, la caisse et le bénéfice
 * net n'ont rien à apprendre de neuf.
 */

const COLUMNS = `
  id, business_id, category, label, amount::float8 AS amount, interval_months,
  next_due_on::text AS next_due_on, last_paid_on::text AS last_paid_on,
  active, note, created_at, updated_at
`;

function champs(body: Record<string, unknown>) {
  return {
    category: enumValue(body.category, 'poste de dépense', EXPENSE_CATEGORIES),
    label: str(body.label, 'libellé', { max: 160 }),
    amount: round2(num(body.amount, 'montant', { min: 0, required: false })),
    intervalMonths: Math.round(
      num(body.intervalMonths, 'nombre de mois', { min: MOIS_MIN, max: MOIS_MAX })
    ),
    note: str(body.note, 'note', { required: false, max: 500 }),
  };
}

/**
 * Les charges d'une boutique, les plus pressantes en tête.
 *
 * L'ordre est celui de l'urgence et non de la saisie : ce qui est en retard
 * se lit avant ce qui attendra trois mois. Les charges rangées passent après,
 * et seulement si on les demande.
 */
export async function listCharges(
  businessId: string,
  { inactives = false }: { inactives?: boolean } = {}
): Promise<ChargeRow[]> {
  const sql = getSql();
  return rows<ChargeRow>(
    await sql`
      SELECT ${sql.unsafe(COLUMNS)} FROM recurring_charges
       WHERE business_id = ${businessId}
         AND (${inactives} OR active)
       ORDER BY active DESC, next_due_on ASC
    `
  );
}

export async function getCharge(businessId: string, chargeId: string): Promise<ChargeRow> {
  const sql = getSql();
  const row = one<ChargeRow>(
    await sql`
      SELECT ${sql.unsafe(COLUMNS)} FROM recurring_charges
       WHERE id = ${chargeId} AND business_id = ${businessId}
    `
  );
  if (!row) throw notFound('Charge introuvable.');
  return row;
}

/**
 * Crée une charge, et pose sa première échéance.
 *
 * La date de début est celle que le gérant donne — le prochain loyer, le
 * prochain salaire — ou aujourd'hui s'il n'en donne pas. Elle n'est pas
 * calculée : au premier enregistrement, il n'y a pas encore de paiement d'où
 * compter.
 */
/**
 * Crée une charge à partir du **dernier paiement** (§67).
 *
 * Le gérant ne choisit pas d'échéance : il dit quand il a payé, combien, et
 * tous les combien de mois cela revient. L'échéance en découle — c'est le
 * calcul, pas lui, qui doit compter les mois.
 *
 * Le paiement déclaré écrit aussi la dépense, à moins qu'on ne le lui
 * interdise : il l'a payé, l'argent est sorti, et une charge qui démarre sans
 * laisser de trace ferait un trou dans le mois en cours. `enregistrerDepense:
 * false` existe pour le gérant qui a déjà saisi cette dépense à la main et ne
 * veut pas la compter deux fois.
 */
export async function createCharge(session: Session, body: Record<string, unknown>) {
  const valeurs = champs(body);
  const id = newId('chg');
  const paye = str(body.paidOn, 'date du paiement', { required: false, max: 10 }) || aujourdhui();
  const suivante = prochaineEcheance(paye, valeurs.intervalMonths);
  const avecDepense = body.enregistrerDepense !== false;
  const sql = getSql();

  await runTransaction([
    sql`
      INSERT INTO recurring_charges (
        id, business_id, category, label, amount, interval_months,
        next_due_on, last_paid_on, note
      ) VALUES (
        ${id}, ${session.businessId}, ${valeurs.category}, ${valeurs.label}, ${valeurs.amount},
        ${valeurs.intervalMonths}, ${suivante}::date, ${paye}::date, ${valeurs.note}
      )
    `,
    ...(avecDepense && valeurs.amount > 0
      ? [
          sql`
            INSERT INTO expenses (
              id, business_id, category, label, amount, spent_on, note, user_id
            ) VALUES (
              ${newId('exp')}, ${session.businessId}, ${valeurs.category}, ${valeurs.label},
              ${valeurs.amount}, ${paye}::date, ${valeurs.note}, ${session.userId}
            )
          `,
        ]
      : []),
  ]);

  return getCharge(session.businessId, id);
}

export async function updateCharge(
  session: Session,
  chargeId: string,
  body: Record<string, unknown>
) {
  await getCharge(session.businessId, chargeId);
  const valeurs = champs(body);
  const echeance = str(body.nextDueOn, 'prochaine échéance', { required: false, max: 10 });
  const active = body.active === undefined ? null : body.active === true;

  await getSql()`
    UPDATE recurring_charges
       SET category = ${valeurs.category}, label = ${valeurs.label}, amount = ${valeurs.amount},
           interval_months = ${valeurs.intervalMonths}, note = ${valeurs.note},
           next_due_on = COALESCE(${echeance}::date, next_due_on),
           active = COALESCE(${active}::boolean, active),
           updated_at = now()
     WHERE id = ${chargeId} AND business_id = ${session.businessId}
  `;
  return getCharge(session.businessId, chargeId);
}

export async function deleteCharge(session: Session, chargeId: string): Promise<void> {
  await getCharge(session.businessId, chargeId);
  // Les dépenses déjà payées restent : elles sont de l'argent sorti, pas une
  // promesse. Seul le calendrier disparaît.
  await getSql()`
    DELETE FROM recurring_charges
     WHERE id = ${chargeId} AND business_id = ${session.businessId}
  `;
}

/**
 * Paie une charge : une dépense, et le chrono relancé (§66).
 *
 * Les deux écritures tiennent dans la même transaction. Séparées, un échec
 * entre elles laisserait soit une dépense sans échéance repoussée — le gérant
 * serait rappelé le lendemain pour un loyer déjà payé —, soit une échéance
 * repoussée sans dépense, et l'argent sorti ne figurerait nulle part.
 *
 * L'échéance est comptée **depuis le jour du paiement**, pas depuis
 * l'ancienne : payer avec trois jours de retard ne doit pas rappeler trois
 * jours plus tard.
 */
export async function payCharge(session: Session, chargeId: string, body: Record<string, unknown>) {
  const charge = await getCharge(session.businessId, chargeId);
  const montant = round2(
    num(body.amount, 'montant', { min: 0, required: false }) || charge.amount
  );
  const paye = str(body.paidOn, 'date du paiement', { required: false, max: 10 }) || aujourdhui();
  const suivante = prochaineEcheance(paye, charge.interval_months);
  const sql = getSql();

  await runTransaction([
    sql`
      INSERT INTO expenses (id, business_id, category, label, amount, spent_on, note, user_id)
      VALUES (
        ${newId('exp')}, ${session.businessId}, ${charge.category}, ${charge.label},
        ${montant}, ${paye}::date,
        ${str(body.note, 'note', { required: false, max: 500 })}, ${session.userId}
      )
    `,
    sql`
      UPDATE recurring_charges
         SET last_paid_on = ${paye}::date, next_due_on = ${suivante}::date, updated_at = now()
       WHERE id = ${chargeId} AND business_id = ${session.businessId}
    `,
  ]);

  return getCharge(session.businessId, chargeId);
}

/** Aujourd'hui en `YYYY-MM-DD`, sans dépendre du fuseau du serveur. */
function aujourdhui(): string {
  const maintenant = new Date();
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(
    maintenant.getDate()
  ).padStart(2, '0')}`;
}
