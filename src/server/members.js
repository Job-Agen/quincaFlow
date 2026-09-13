import { getSql, one, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, conflict, forbidden, notFound } from '../lib/http';
import { str, email as emailField } from '../lib/validate';
import { ROLES, hashPassword } from '../lib/auth';

/**
 * Équipe de la boutique (§5).
 *
 * Une quincaillerie a souvent un gérant et un ou deux vendeurs au comptoir. Le
 * rôle SELLER existait au schéma depuis l'origine, mais aucune route ne créait
 * de second compte : la boutique restait mono-utilisateur, et le vendeur
 * travaillait sous le compte du patron — ce qui rend le journal des ventes
 * incapable de dire qui a fait quoi.
 *
 * Le mot de passe est fixé par le propriétaire et remis de vive voix. Tant
 * qu'aucun service d'envoi n'est branché, c'est la seule façon honnête de
 * transmettre un premier accès ; le vendeur le change ensuite depuis
 * Paramètres.
 */

const MIN_PASSWORD = 8;

export async function listMembers(businessId) {
  return getSql()`
    SELECT m.user_id AS id, m.role, m.created_at,
           u.name, u.email, u.phone
      FROM business_members m
      JOIN users u ON u.id = m.user_id
     WHERE m.business_id = ${businessId}
     ORDER BY CASE m.role WHEN 'OWNER' THEN 0 ELSE 1 END, u.name
  `;
}

/** Le propriétaire crée un vendeur et lui remet un premier mot de passe. */
export async function addSeller(session, body) {
  const password = str(body.password, 'mot de passe', { max: 200 });
  if (password.length < MIN_PASSWORD) {
    throw badRequest(`Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
  }

  const input = {
    name: str(body.name, 'nom', { max: 160 }),
    email: emailField(body.email),
    phone: str(body.phone, 'téléphone', { required: false, max: 40 }),
  };

  const sql = getSql();
  // L'unicité de l'e-mail est globale, et un compte n'appartient qu'à une
  // boutique : réutiliser une adresse déjà connue rattacherait silencieusement
  // quelqu'un à deux quincailleries.
  if (one(await sql`SELECT id FROM users WHERE email = ${input.email} LIMIT 1`)) {
    throw conflict('Un compte existe déjà avec cette adresse e-mail.');
  }

  const userId = newId('usr');
  await runTransaction([
    sql`
      INSERT INTO users (id, name, email, phone, password_hash)
      VALUES (${userId}, ${input.name}, ${input.email}, ${input.phone},
              ${await hashPassword(password)})
    `,
    sql`
      INSERT INTO business_members (business_id, user_id, role)
      VALUES (${session.businessId}, ${userId}, ${ROLES.SELLER})
    `,
  ]);

  return one(
    await sql`
    SELECT m.user_id AS id, m.role, m.created_at, u.name, u.email, u.phone
      FROM business_members m JOIN users u ON u.id = m.user_id
     WHERE m.user_id = ${userId} AND m.business_id = ${session.businessId}
  `
  );
}

/** Membre de *cette* boutique, ou rien : l'appartenance fait partie de la clé. */
async function memberOf(businessId, userId) {
  const row = one(
    await getSql()`
      SELECT user_id AS id, role FROM business_members
       WHERE business_id = ${businessId} AND user_id = ${userId}
    `
  );
  if (!row) throw notFound('Membre introuvable.');
  return row;
}

/**
 * Le propriétaire redonne un mot de passe à un vendeur qui a perdu le sien.
 *
 * C'est aussi, tant qu'aucun envoi d'e-mail n'existe, le seul chemin de
 * récupération pour un vendeur. Le propriétaire, lui, n'a personne au-dessus :
 * son propre oubli reste à traiter en base.
 */
export async function resetMemberPassword(session, userId, body) {
  const member = await memberOf(session.businessId, userId);
  if (member.role === ROLES.OWNER) {
    throw forbidden('Le propriétaire change son mot de passe depuis ses paramètres.');
  }

  const password = str(body.password, 'mot de passe', { max: 200 });
  if (password.length < MIN_PASSWORD) {
    throw badRequest(`Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
  }

  const sql = getSql();
  await runTransaction([
    sql`UPDATE users SET password_hash = ${await hashPassword(password)} WHERE id = ${userId}`,
    // Les sessions du vendeur tombent : un accès qu'on réattribue ne doit pas
    // rester ouvert sur l'appareil d'où il a peut-être fui.
    sql`
      UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id = ${userId} AND revoked_at IS NULL
    `,
  ]);
}

/**
 * Retire un vendeur de la boutique.
 *
 * Le compte utilisateur et ses ventes restent : l'historique doit continuer de
 * dire qui a encaissé, même après un départ. Seul le lien d'appartenance est
 * rompu, ce qui suffit à fermer l'accès.
 */
export async function removeMember(session, userId) {
  const member = await memberOf(session.businessId, userId);
  if (member.role === ROLES.OWNER) {
    throw forbidden('Le propriétaire ne peut pas être retiré de sa propre boutique.');
  }

  const sql = getSql();
  await runTransaction([
    sql`
      DELETE FROM business_members
       WHERE business_id = ${session.businessId} AND user_id = ${userId}
    `,
    sql`
      UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id = ${userId} AND revoked_at IS NULL
    `,
  ]);
}
