import { getSql, one, rows, runTransaction } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, conflict, unauthorized, notFound } from '../lib/http';
import { str, email as emailField } from '../lib/validate';
import { ROLES, hashPassword, verifyPassword } from '../lib/auth';
import { confirmsBusinessName } from '../domain/business';
import type { BusinessRow, Profile, Role, Session, UserRow } from '@/types';

/**
 * Inscription et connexion (§7).
 *
 * S'inscrire crée trois choses d'un coup : un utilisateur, sa quincaillerie, et
 * le lien OWNER entre les deux. Une boutique sans propriétaire ou un compte sans
 * boutique n'a aucun sens dans un SaaS multi-tenant — d'où la transaction.
 */

export async function register(body: Record<string, unknown>) {
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
  const existing = one(await sql`SELECT id FROM users WHERE email = ${input.email} LIMIT 1`);
  if (existing) throw conflict('Un compte existe déjà avec cette adresse e-mail.');

  /*
   * Le téléphone est unique lui aussi, et il manquait à ce contrôle.
   *
   * L'identifiant de connexion accepte l'e-mail *ou* le téléphone (§7) : deux
   * comptes au même numéro rendraient la connexion ambiguë, d'où l'index
   * unique. Mais seule la collision d'e-mail était annoncée ; celle du
   * téléphone remontait de la contrainte Postgres, traduite en « Cette
   * référence est déjà utilisée » — un message qui parle d'une référence
   * produit à quelqu'un qui crée un compte. Le cas est réel : dans une boutique
   * familiale, deux personnes donnent le même numéro.
   */
  if (input.phone) {
    const memeNumero = one(await sql`SELECT id FROM users WHERE phone = ${input.phone} LIMIT 1`);
    if (memeNumero) throw conflict('Un compte existe déjà avec ce numéro de téléphone.');
  }

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
export async function authenticate(body: Record<string, unknown>) {
  const identifier = str(body.identifier, 'identifiant', { max: 160 }).toLowerCase();
  const password = str(body.password, 'mot de passe', { max: 200 });

  const user = one<{ id: string; name: string; email: string | null; password_hash: string }>(
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

  const membership = one<{ business_id: string; role: Role }>(
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
export async function profile(session: Session): Promise<Profile> {
  const sql = getSql();
  const [userResult, businessResult] = await Promise.all([
    sql`SELECT id, name, email, phone FROM users WHERE id = ${session.userId}`,
    sql`SELECT id, name, phone, address, tagline, currency
          FROM businesses WHERE id = ${session.businessId}`,
  ]);
  const user = one<UserRow>(userResult);
  const business = one<BusinessRow>(businessResult);
  if (!user || !business) throw notFound('Compte introuvable.');
  return { user, business, role: session.role };
}

/**
 * Changement de mot de passe.
 *
 * L'ancien est exigé même si la session est valide : un téléphone laissé
 * déverrouillé sur le comptoir ne doit pas suffire à s'approprier la boutique.
 *
 * Toutes les autres sessions sont révoquées dans la foulée. Quand on change son
 * mot de passe, c'est souvent qu'on le soupçonne connu ; laisser vivre les
 * sessions ouvertes ailleurs viderait le geste de son sens. Celle qui fait la
 * demande est réémise pour ne pas se déconnecter elle-même.
 */
export async function changePassword(session: Session, body: Record<string, unknown>) {
  const current = str(body.currentPassword, 'mot de passe actuel', { max: 200 });
  const next = str(body.newPassword, 'nouveau mot de passe', { max: 200 });
  if (next.length < 8) {
    throw badRequest('Le nouveau mot de passe doit contenir au moins 8 caractères.');
  }
  if (next === current) {
    throw badRequest('Le nouveau mot de passe doit être différent de l’ancien.');
  }

  const sql = getSql();
  const user = one<{ password_hash: string }>(
    await sql`SELECT password_hash FROM users WHERE id = ${session.userId}`
  );
  if (!user) throw notFound('Compte introuvable.');
  if (!(await verifyPassword(current, user.password_hash))) {
    throw badRequest('Mot de passe actuel incorrect.');
  }

  await runTransaction([
    sql`
      UPDATE users SET password_hash = ${await hashPassword(next)}
       WHERE id = ${session.userId}
    `,
    sql`
      UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id = ${session.userId} AND revoked_at IS NULL
    `,
  ]);
}

/**
 * Ce qu'une suppression de boutique emporte, compté avant de l'exécuter.
 *
 * Le gérant doit voir le poids de ce qu'il efface — « 184 ventes » n'est pas
 * « 2 ventes » — et l'écran le lui montre avant de lui demander de taper le nom.
 */
export interface BusinessDeletion {
  businessName: string;
  products: number;
  sales: number;
  customers: number;
  suppliers: number;
  members: number;
  accountsRemoved: number;
}

/** Ce que la boutique contient, pour l'annoncer avant de l'effacer (§46). */
export async function businessWeight(
  session: Session
): Promise<Omit<BusinessDeletion, 'accountsRemoved'>> {
  const sql = getSql();
  const ligne = one<Omit<BusinessDeletion, 'accountsRemoved'>>(
    await sql`
      SELECT b.name AS "businessName",
             (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id)::int AS products,
             (SELECT COUNT(*) FROM sales s WHERE s.business_id = b.id)::int AS sales,
             (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id)::int AS customers,
             (SELECT COUNT(*) FROM suppliers f WHERE f.business_id = b.id)::int AS suppliers,
             (SELECT COUNT(*) FROM business_members m WHERE m.business_id = b.id)::int AS members
        FROM businesses b
       WHERE b.id = ${session.businessId}
    `
  );
  if (!ligne) throw notFound('Boutique introuvable.');
  return ligne;
}

/**
 * Supprime la boutique, et avec elle tout ce qu'elle contient (§46).
 *
 * Trois verrous, et chacun arrête une erreur différente. Le rôle — seul le
 * propriétaire peut le faire, et c'est la route qui l'impose (§5). Le mot de
 * passe — il arrête le téléphone resté déverrouillé sur le comptoir. Le nom de
 * la boutique à retaper — il arrête le propriétaire lui-même, celui qui a le
 * mot de passe et qui appuie trop vite.
 *
 * Rien n'est désactivé ni archivé : la table part, et ses dépendances avec elle
 * par les clés étrangères. Un « archivage » laisserait croire à un retour en
 * arrière qui n'existe pas, et on ne fait pas croire ça à quelqu'un qui efface
 * ses ventes.
 *
 * Les comptes ne disparaissent pas tous. Un utilisateur n'appartient pas à une
 * boutique ; seuls partent ceux qui n'en tiennent plus aucune — le propriétaire
 * et ses vendeurs, dans le cas ordinaire. Celui qui gère une seconde
 * quincaillerie garde son compte et y reste.
 */
export async function deleteBusiness(
  session: Session,
  body: Record<string, unknown>
): Promise<BusinessDeletion> {
  const password = str(body.password, 'mot de passe', { max: 200 });
  const confirmation = str(body.confirmation, 'nom de la boutique', { max: 200 });

  const sql = getSql();
  const user = one<{ password_hash: string }>(
    await sql`SELECT password_hash FROM users WHERE id = ${session.userId}`
  );
  if (!user) throw notFound('Compte introuvable.');
  if (!(await verifyPassword(password, user.password_hash))) {
    throw badRequest('Mot de passe incorrect.');
  }

  const poids = await businessWeight(session);
  if (!confirmsBusinessName(confirmation, poids.businessName)) {
    throw badRequest(`Pour confirmer, tapez le nom exact : ${poids.businessName}`);
  }

  // Relevés avant la suppression : une fois la boutique partie, l'appartenance
  // qui permettait de les reconnaître aura disparu avec elle.
  const orphelins = rows<{ id: string }>(
    await sql`
      SELECT u.id
        FROM users u
        JOIN business_members m ON m.user_id = u.id
       WHERE m.business_id = ${session.businessId}
         AND NOT EXISTS (
           SELECT 1 FROM business_members autre
            WHERE autre.user_id = u.id AND autre.business_id <> ${session.businessId}
         )
    `
  );

  await runTransaction([
    sql`DELETE FROM businesses WHERE id = ${session.businessId}`,
    sql`DELETE FROM users WHERE id = ANY(${orphelins.map((o) => o.id)}::text[])`,
  ]);

  return { ...poids, accountsRemoved: orphelins.length };
}

/** Coordonnées de la boutique — elles figurent en tête des factures (§15). */
export async function updateBusiness(session: Session, body: Record<string, unknown>) {
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
