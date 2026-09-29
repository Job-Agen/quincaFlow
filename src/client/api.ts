/**
 * Client HTTP de l'application.
 *
 * L'access token expire au bout de quinze minutes, ce qui arrive constamment
 * pendant une journée de comptoir. Plutôt que de renvoyer le vendeur à l'écran
 * de connexion, un 401 déclenche un rafraîchissement puis rejoue la requête une
 * seule fois. Les appels concurrents partagent le même rafraîchissement : sans
 * cela, trois requêtes simultanées feraient trois rotations de refresh token et
 * deux d'entre elles échoueraient.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Paramètres d'URL tels que les écrans les passent. */
export type Query = Record<string, string | number | boolean | null | undefined>;

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST' })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function send<T>(path: string, options?: RequestInit, retry = true): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(25000),
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
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
  // PUT plutôt que POST pour le justificatif : joindre deux fois la même photo
  // doit donner le même résultat, un seul reçu (§40).
  put: <T>(path: string, body?: unknown) =>
    send<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
};
