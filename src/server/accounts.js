import { getSql, one, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, conflict, unauthorized, notFound } from '../lib/http';
import { str, email as emailField } from '../lib/validate';
import { ROLES, hashPassword, verifyPassword } from '../lib/auth';

/**
 * Inscription et connexion (§7).
 *
 * S'inscrire crée trois choses d'un coup : un utilisateur, sa quincaillerie, et
 * le lien OWNER entre les deux. Une boutique sans propriétaire ou un compte sans
 * boutique n'a aucun sens dans un SaaS multi-tenant — d'où la transaction.
 */

export async function register(body) {
  const password = str(body.password, 'mot de passe', { max: 200 });
  if (password.length < 8) {
    throw badRequest('Le mot de passe doit contenir au moins 8 caractères.');
  }

  const input = {
    ownerName: str(body.ownerName, 'nom du propriétaire', { max: 160 }),
    businessName: str(body.businessName, 'nom de la quincaillerie', { max: 160 }),
    phone: str(body.phone, 'téléphone', { required: false, max: 40 }),
    email: emailField(body.email),
  };

  const sql = getSql();
  const existing = one(
    await sql`SELECT id FROM users WHERE email = ${input.email} LIMIT 1`
  );
  if (existing) throw conflict('Un compte existe déjà avec cette adresse e-mail.');

  const userId = newId('usr');
  const businessId = newId('biz');

  await runTransaction([
    sql`
      INSERT INTO users (id, name, email, phone, password_hash)
      VALUES (${userId}, ${input.ownerName}, ${input.email}, ${input.phone},
              ${await hashPassword(password)})
    `,
    sql`
      INSERT INTO businesses (id, name, phone)
      VALUES (${businessId}, ${input.businessName}, ${input.phone})
    `,
    sql`
      INSERT INTO business_members (business_id, user_id, role)
      VALUES (${businessId}, ${userId}, ${ROLES.OWNER})
    `,
  ]);

  return { userId, businessId, role: ROLES.OWNER, name: input.ownerName };
}

/**
 * Vérifie les identifiants et renvoie l'appartenance à une boutique.
 *
 * L'identifiant peut être l'e-mail ou le téléphone. Le message d'erreur est
 * volontairement identique dans les deux cas — compte inexistant et mot de passe
 * faux — pour ne pas révéler quels comptes existent.
 */
export async function authenticate(body) {
  const identifier = str(body.identifier, 'identifiant', { max: 160 }).toLowerCase();
  const password = str(body.password, 'mot de passe', { max: 200 });

  const user = one(
    await getSql()`
      SELECT id, name, email, password_hash
        FROM users
       WHERE lower(email) = ${identifier} OR phone = ${identifier}
       LIMIT 1
    `
  );

  const invalid = unauthorized('Identifiant ou mot de passe incorrect.');
  if (!user) {
    // Comparaison à vide malgré tout : sans elle, une réponse instantanée
    // signalerait qu'aucun compte ne porte cet identifiant.
    await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    throw invalid;
  }
  if (!(await verifyPassword(password, user.password_hash))) throw invalid;

  const membership = one(
    await getSql()`
      SELECT business_id, role FROM business_members WHERE user_id = ${user.id} LIMIT 1
    `
  );
  if (!membership) throw invalid;

  return {
    userId: user.id,
    businessId: membership.business_id,
    role: membership.role,
    name: user.name,
  };
}

/** Profil complet de la session : utilisateur + boutique. */
export async function profile(session) {
  const sql = getSql();
  const [user, business] = await Promise.all([
    sql`SELECT id, name, email, phone FROM users WHERE id = ${session.userId}`,
    sql`SELECT id, name, phone, address, tagline, currency
          FROM businesses WHERE id = ${session.businessId}`,
  ]);
  if (!user.length || !business.length) throw notFound('Compte introuvable.');
  return { user: user[0], business: business[0], role: session.role };
}

/** Coordonnées de la boutique — elles figurent en tête des factures (§15). */
export async function updateBusiness(session, body) {
  await getSql()`
    UPDATE businesses
       SET name = ${str(body.name, 'nom de la boutique', { max: 160 })},
           tagline = ${str(body.tagline, 'slogan', { required: false, max: 160 })},
           phone = ${str(body.phone, 'téléphone', { required: false, max: 40 })},
           address = ${str(body.address, 'adresse', { required: false, max: 300 })},
           currency = ${str(body.currency, 'devise', { required: false, max: 10 }) || 'FCFA'},
           updated_at = now()
     WHERE id = ${session.businessId}
  `;
  return profile(session);
}
