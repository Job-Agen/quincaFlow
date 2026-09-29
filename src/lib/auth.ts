import { createHash, randomBytes } from 'crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { getSql, one } from './db';
import { newId } from './ids';
import { unauthorized, forbidden } from './http';
import { pickRefreshToken } from './session';
import type { Role, Session } from '@/types';

/** Le membre retrouvé par un refresh token, tel que la rotation le renvoie. */
export interface RotatedMember {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  business_id: string;
}

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
 *
 * **Deux transports pour les mêmes jetons (§41).** Le navigateur les reçoit en
 * cookies `HttpOnly`, que le JavaScript de la page ne peut pas lire : c'est ce
 * qui met une session hors de portée d'un script injecté. Une application native
 * n'a pas de cookies exploitables et les reçoit dans le corps de la réponse,
 * pour les ranger dans le coffre du téléphone.
 *
 * Le second transport n'affaiblit pas le premier : les jetons ne sont rendus
 * dans le corps que si le client le demande explicitement, et le web ne le
 * demande jamais. Un script injecté dans la page ne peut donc pas s'en servir
 * pour exfiltrer une session qu'il ne pouvait pas lire.
 */

export const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

export const ACCESS_COOKIE = 'qf_at';
export const REFRESH_COOKIE = 'qf_rt';

export const ROLES: Record<Role, Role> = { OWNER: 'OWNER', SELLER: 'SELLER' };

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Échouer bruyamment plutôt que signer avec une valeur par défaut connue :
    // un secret partagé publiquement laisserait forger n'importe quelle session.
    throw new Error('JWT_SECRET non configurée. Renseignez-la dans .env.local.');
  }
  return new TextEncoder().encode(secret);
}

// ───────────────────────────── Mots de passe ──────────────────────────────

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─────────────────────────────── Access token ─────────────────────────────

export async function signAccessToken({
  userId,
  businessId,
  role,
  name,
}: Session): Promise<string> {
  return new SignJWT({ businessId, role, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

// ────────────────────────────── Refresh token ─────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Crée un refresh token, en stocke l'empreinte, et renvoie la valeur en clair. */
export async function issueRefreshToken(userId: string, businessId: string): Promise<string> {
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
export async function rotateRefreshToken(
  token: string | null | undefined
): Promise<{ member: RotatedMember; refreshToken: string } | null> {
  if (!token) return null;
  const sql = getSql();
  const row = one<{ user_id: string; business_id: string }>(
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

  const member = one<RotatedMember>(
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

export async function revokeRefreshToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await getSql()`
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
  `;
}

// ──────────────────────────────── Cookies ─────────────────────────────────

function cookieOptions(maxAge: number, path = '/') {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path,
    maxAge,
  };
}

export async function setSessionCookies({
  accessToken,
  refreshToken,
}: {
  accessToken: string;
  refreshToken?: string | null;
}): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TTL_SECONDS));
  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_DAYS * 24 * 3600));
  }
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, '', cookieOptions(0));
  store.set(REFRESH_COOKIE, '', cookieOptions(0));
}

/**
 * Refresh token de la requête : cookie, ou corps envoyé par un client natif.
 *
 * Le choix entre les deux vit dans `pickRefreshToken`, qui est pure et testée ;
 * ici on ne fait que lui présenter le cookie (§41).
 */
export async function readRefreshCookie(body?: Record<string, unknown>): Promise<string | null> {
  const store = await cookies();
  return pickRefreshToken(store.get(REFRESH_COOKIE)?.value, body);
}

// ──────────────────────────────── Gardes ──────────────────────────────────

/**
 * Jeton d'accès de la requête courante.
 *
 * Le cookie d'abord, puis l'en-tête `Authorization` : un navigateur porte
 * toujours son cookie, et lui donner la priorité évite qu'un en-tête ajouté par
 * un intermédiaire ne prenne le pas sur la session réelle du gérant.
 */
async function accessToken(): Promise<string | null> {
  const store = await cookies();
  const cookieToken = store.get(ACCESS_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  const header = (await headers()).get('authorization') || '';
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/** Session courante, ou null. À n'utiliser que là où l'anonyme est acceptable. */
export async function getSession(): Promise<Session | null> {
  const token = await accessToken();
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub || !payload?.businessId) return null;
  return {
    userId: payload.sub,
    businessId: String(payload.businessId),
    // Un rôle inconnu est ramené au moins-disant : mieux vaut refuser une action
    // permise que d'en autoriser une qui ne l'est pas.
    role: payload.role === 'OWNER' ? 'OWNER' : 'SELLER',
    name: typeof payload.name === 'string' ? payload.name : '',
  };
}

/**
 * Session courante ou 401. C'est la garde que toute route métier appelle en
 * première ligne — elle fournit le `businessId` sur lequel les requêtes filtrent.
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session;
}

/** Réserve une action au propriétaire (§5). */
export async function requireOwner(): Promise<Session> {
  const session = await requireAuth();
  if (session.role !== ROLES.OWNER) throw forbidden('Réservé au propriétaire.');
  return session;
}
