import { NextResponse } from 'next/server';

/**
 * Erreur applicative portant un code HTTP. Toute route enveloppe son corps dans
 * `handle()` : une ApiError devient une réponse propre, toute autre exception
 * devient un 500 générique sans fuir la trace au client (§34).
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const unauthorized = (message = 'Session expirée ou invalide.') =>
  new ApiError(401, message);
export const forbidden = (message = 'Action non autorisée.') => new ApiError(403, message);
export const notFound = (message = 'Introuvable.') => new ApiError(404, message);
export const conflict = (message) => new ApiError(409, message);

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

/** Exécute le corps d'une route et convertit toute erreur en réponse JSON. */
export async function handle(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message, details: error.details ?? null }, error.status);
    }
    console.error('[api]', error);
    return json({ error: 'Une erreur est survenue. Réessayez.' }, 500);
  }
}

/** Corps JSON d'une requête, ou {} si le corps est vide ou illisible. */
export async function readBody(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}
