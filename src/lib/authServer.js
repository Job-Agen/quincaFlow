import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'quincailpro-neon-secret-key-change-me';
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
export const COOKIE_NAME = 'qp_session';

/**
 * Hache un mot de passe avec bcrypt.
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Vérifie un mot de passe en clair par rapport à son hash.
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Signe un jeton de session JWT pour l'utilisateur.
 */
export async function createSessionToken(user) {
  return await new SignJWT({ id: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET_KEY);
}

/**
 * Vérifie et décode un jeton JWT de session.
 */
export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Récupère l'utilisateur connecté depuis les cookies de la requête.
 */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

/**
 * Définit le cookie de session sur le cookieStore.
 */
export async function setSessionCookie(token) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  });
}

/**
 * Supprime le cookie de session.
 */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
