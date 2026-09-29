import * as SecureStore from 'expo-secure-store';
import type { IssuedTokens, Profile } from '@/types';

/**
 * Client HTTP de l'application mobile (§41).
 *
 * Il fait le même travail que `src/client/api.ts` côté web — un 401 déclenche un
 * rafraîchissement puis rejoue la requête une seule fois, et les appels
 * concurrents partagent ce rafraîchissement. Mais il ne peut pas être le même
 * fichier, et c'est la seule divergence assumée du partage :
 *
 * — le navigateur porte ses jetons en cookies `HttpOnly`, qu'il envoie seul ;
 * — l'application mobile n'en a pas, et doit ranger les siens puis les
 *   présenter à chaque requête.
 *
 * Le refresh token va dans le coffre du système (Keystore sur Android), jamais
 * dans un stockage ordinaire : c'est lui qui vaut trente jours de session, et un
 * téléphone de comptoir passe de main en main.
 */

const CLE_REFRESH = 'quincaflow.refresh';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Adresse du serveur.
 *
 * Elle est lue à la compilation depuis `EXPO_PUBLIC_API_URL` : une application
 * installée ne peut pas demander au commerçant de saisir une URL, et la figer
 * dans le code obligerait à recompiler pour viser une préproduction.
 */
export const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || 'https://quincaflow.vercel.app'
).replace(/\/+$/, '');

/**
 * Jeton d'accès, gardé en mémoire seulement.
 *
 * Il vit quinze minutes ; l'écrire sur le disque l'exposerait sans rien faire
 * gagner, puisqu'il faudrait de toute façon le renouveler au lancement.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

/** Range les jetons d'une session qui vient de s'ouvrir. */
export async function storeSession(tokens: IssuedTokens): Promise<void> {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(CLE_REFRESH, tokens.refreshToken);
}

/** Oublie la session, des deux côtés : mémoire et coffre. */
export async function clearSession(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(CLE_REFRESH);
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

export function readRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(CLE_REFRESH);
}

/** Réponse d'authentification telle que le serveur la rend à un client natif. */
type SessionResponse = Profile & { tokens?: IssuedTokens };

/**
 * Renouvelle la session à partir du refresh token du coffre.
 *
 * Les appels concurrents partagent la même promesse : sans cela, trois écrans
 * qui se rafraîchissent ensemble feraient trois rotations, et deux d'entre elles
 * échoueraient — le serveur n'honore un refresh token qu'une fois (§34).
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) return false;
      try {
        const session = await send<SessionResponse>(
          '/api/auth/refresh',
          { method: 'POST', body: JSON.stringify({ refreshToken }) },
          false
        );
        if (!session.tokens) return false;
        await storeSession(session.tokens);
        return true;
      } catch {
        // Un refus est définitif : le jeton a servi, expiré ou été révoqué.
        await clearSession();
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function send<T>(path: string, options?: RequestInit, retry = true): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // C'est cet en-tête qui fait rendre les jetons dans le corps (§41). Le
      // navigateur ne le pose jamais, et garde donc ses cookies HttpOnly.
      'x-quinca-client': 'native',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (response.status === 401 && retry) {
    if (await refreshSession()) return send<T>(path, options, false);
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = payload as { error?: string } | null;
    throw new ApiError(response.status, error?.error || 'Une erreur est survenue.');
  }
  return payload as T;
}

/** Construit une URL avec ses paramètres, en ignorant les valeurs vides. */
export type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query | null): string {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  get: <T>(path: string, query?: Query | null) =>
    send<T>(withQuery(path, query), { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    send<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    send<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
};

/** Ouvre une session et range ses jetons. Utilisé par l'écran de connexion. */
export async function signIn(identifier: string, password: string): Promise<Profile> {
  const session = await api.post<SessionResponse>('/api/auth/login', { identifier, password });
  if (!session.tokens) {
    // Le serveur n'a pas honoré l'en-tête : sans jetons, rien ne suivra, et il
    // vaut mieux le dire ici que laisser chaque écran échouer en 401.
    throw new ApiError(500, 'Le serveur n’a pas ouvert de session pour l’application.');
  }
  await storeSession(session.tokens);
  return session;
}

/** Ferme la session, y compris côté serveur : le jeton est réellement révoqué. */
export async function signOut(): Promise<void> {
  const refreshToken = await readRefreshToken();
  try {
    await api.post('/api/auth/logout', { refreshToken });
  } catch {
    // Une déconnexion ne doit jamais rester bloquée sur un réseau absent : le
    // coffre est vidé quoi qu'il arrive, et le jeton expirera de lui-même.
  }
  await clearSession();
}
