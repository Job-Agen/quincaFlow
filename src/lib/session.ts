import { ACCESS_TTL_SECONDS, issueRefreshToken, setSessionCookies, signAccessToken } from './auth';
import type { IssuedTokens, Profile, Session } from '@/types';

/**
 * Transport des jetons de session (§41).
 *
 * Un seul endroit décide qui reçoit quoi. Recopier la règle dans les quatre
 * routes d'authentification garantirait qu'une seule soit oubliée le jour où
 * elle change — et une route qui rendrait des jetons au navigateur annulerait
 * tout l'intérêt des cookies `HttpOnly`.
 *
 * La décision est séparée de son effet. `sessionPayload` et `pickRefreshToken`
 * sont des fonctions pures : elles portent la règle de sécurité et se testent
 * directement, là où `cookies()` de Next n'existe qu'au creux d'une requête. La
 * règle qui compte n'est ainsi pas celle qu'on ne peut pas éprouver.
 */

/**
 * En-tête par lequel un client natif réclame ses jetons dans le corps.
 *
 * Une demande explicite plutôt qu'une détection du `User-Agent` : un en-tête se
 * lit dans le code du client, là où une heuristique sur l'agent finirait par
 * renvoyer des jetons à un navigateur à la première chaîne inattendue.
 */
export const NATIVE_CLIENT_HEADER = 'x-quinca-client';

/** Vrai si la requête vient d'un client natif et attend ses jetons en clair. */
export function wantsTokens(request: Request): boolean {
  return request.headers.get(NATIVE_CLIENT_HEADER) === 'native';
}

/**
 * Corps de la réponse d'authentification.
 *
 * Les jetons n'y figurent que sur demande explicite, demande qu'un navigateur ne
 * formule jamais : un script injecté dans la page ne peut donc pas s'en servir
 * pour exfiltrer une session que les cookies mettaient hors de sa portée.
 */
export function sessionPayload(
  request: Request,
  profile: Profile,
  tokens: { accessToken: string; refreshToken: string }
): Profile | (Profile & { tokens: IssuedTokens }) {
  if (!wantsTokens(request)) return profile;
  return { ...profile, tokens: { ...tokens, expiresIn: ACCESS_TTL_SECONDS } };
}

/**
 * Choisit le refresh token à honorer : le cookie prime, le corps sert de repli.
 *
 * L'ordre n'est pas indifférent. Un navigateur porte toujours son cookie ; lui
 * donner la priorité évite qu'un corps forgé ne substitue une autre session à
 * celle du gérant.
 */
export function pickRefreshToken(
  cookieToken: string | null | undefined,
  body?: Record<string, unknown>
): string | null {
  if (cookieToken) return cookieToken;
  return typeof body?.refreshToken === 'string' && body.refreshToken ? body.refreshToken : null;
}

/**
 * Ouvre la session : pose les cookies, puis rend le corps attendu par ce client.
 *
 * Les cookies sont posés dans tous les cas — c'est le transport du navigateur,
 * et les poser pour un client natif ne coûte rien.
 */
export async function respondWithSession(
  request: Request,
  profile: Profile,
  tokens: { accessToken: string; refreshToken: string }
): Promise<Profile | (Profile & { tokens: IssuedTokens })> {
  await setSessionCookies(tokens);
  return sessionPayload(request, profile, tokens);
}

/** Jetons neufs pour une session qui vient d'être authentifiée. */
export async function mintTokens(
  session: Session
): Promise<{ accessToken: string; refreshToken: string }> {
  return {
    accessToken: await signAccessToken(session),
    refreshToken: await issueRefreshToken(session.userId, session.businessId),
  };
}
