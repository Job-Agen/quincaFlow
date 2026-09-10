import { createHash, randomBytes } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getSql, one } from './db';
import { newId } from './ids';
import { unauthorized, forbidden } from './http';

/**
 * Authentification (§7, §34).
 *
 * Deux jetons de nature différente :
 *
 *   access  — JWT court (15 min), signé, porté par un cookie HttpOnly. Il contient
 *             le strict nécessaire — userId, businessId, role — et rien de
 *             sensible : un JWT est lisible par quiconque le détient.
 *   refresh — chaîne aléatoire opaque (30 j), stockée *hachée* en base et
 *             révocable. Un vol de la table ne permet donc pas de rejouer une
 *             session, et une déconnexion invalide réellement le jeton.
 *
 * Le `businessId` embarqué dans l'access token est la clé de l'isolation
 * multi-tenant : toute requête métier filtre dessus (§29).
 */

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

export const ACCESS_COOKIE = 'qf_at';
export const REFRESH_COOKIE = 'qf_rt';

export const ROLES = { OWNER: 'OWNER', SELLER: 'SELLER' };

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Échouer bruyamment plutôt que signer avec une valeur par défaut connue :
    // un secret partagé publiquement laisserait forger n'importe quelle session.
    throw new Error('JWT_SECRET non configurée. Renseignez-la dans .env.local.');
  }
  return new TextEncoder().encode(secret);
}

// ───────────────────────────── Mots de passe ──────────────────────────────

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ─────────────────────────────── Access token ─────────────────────────────

export async function signAccessToken({ userId, businessId, role, name }) {
  return new SignJWT({ businessId, role, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secretKey());
}

async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

// ────────────────────────────── Refresh token ─────────────────────────────

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Crée un refresh token, en stocke l'empreinte, et renvoie la valeur en clair. */
export async function issueRefreshToken(userId, businessId) {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000);
  await getSql()`
    INSERT INTO refresh_tokens (id, user_id, business_id, token_hash, expires_at)
    VALUES (${newId('rt')}, ${userId}, ${businessId}, ${hashToken(token)}, ${expiresAt.toISOString()})
  `;
  return token;
}

/**
 * Échange un refresh token contre sa session, puis le remplace (rotation).
 * Un jeton ne sert qu'une fois : rejouer un jeton déjà utilisé échoue.
 */
export async function rotateRefreshToken(token) {
  if (!token) return null;
  const sql = getSql();
  const row = one(
    await sql`
      UPDATE refresh_tokens
         SET revoked_at = now()
       WHERE token_hash = ${hashToken(token)}
         AND revoked_at IS NULL
         AND expires_at > now()
      RETURNING user_id, business_id
    `
  );
  if (!row) return null;

  const member = one(
    await sql`
      SELECT u.id, u.name, u.email, m.role, m.business_id
        FROM business_members m
        JOIN users u ON u.id = m.user_id
       WHERE m.user_id = ${row.user_id} AND m.business_id = ${row.business_id}
    `
  );
  if (!member) return null;

  const next = await issueRefreshToken(member.id, member.business_id);
  return { member, refreshToken: next };
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  await getSql()`
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
  `;
}

// ──────────────────────────────── Cookies ─────────────────────────────────

function cookieOptions(maxAge, path = '/') {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path,
    maxAge,
  };
}

export async function setSessionCookies({ accessToken, refreshToken }) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TTL_SECONDS));
  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_DAYS * 24 * 3600));
  }
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.set(ACCESS_COOKIE, '', cookieOptions(0));
  store.set(REFRESH_COOKIE, '', cookieOptions(0));
}

export async function readRefreshCookie() {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value || null;
}

// ──────────────────────────────── Gardes ──────────────────────────────────

/** Session courante, ou null. À n'utiliser que là où l'anonyme est acceptable. */
export async function getSession() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub || !payload?.businessId) return null;
  return {
    userId: payload.sub,
    businessId: payload.businessId,
    role: payload.role || ROLES.SELLER,
    name: payload.name || '',
  };
}

/**
 * Session courante ou 401. C'est la garde que toute route métier appelle en
 * première ligne — elle fournit le `businessId` sur lequel les requêtes filtrent.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session;
}

/** Réserve une action au propriétaire (§5). */
export async function requireOwner() {
  const session = await requireAuth();
  if (session.role !== ROLES.OWNER) throw forbidden('Réservé au propriétaire.');
  return session;
}
