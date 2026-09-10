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
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let refreshing = null;

function refreshSession() {
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

async function send(path, options, retry = true) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });

  if (response.status === 401 && retry) {
    if (await refreshSession()) return send(path, options, false);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error || 'Une erreur est survenue.');
  }
  return payload;
}

/** Construit une URL avec ses paramètres, en ignorant les valeurs vides. */
function withQuery(path, query) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  get: (path, query) => send(withQuery(path, query), { method: 'GET' }),
  post: (path, body) => send(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => send(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: (path) => send(path, { method: 'DELETE' }),
};
