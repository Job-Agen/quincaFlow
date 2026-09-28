import { NextResponse } from 'next/server';

/**
 * Erreur applicative portant un code HTTP. Toute route enveloppe son corps dans
 * `handle()` : une ApiError devient une réponse propre, toute autre exception
 * devient un 500 générique sans fuir la trace au client (§34).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);
export const unauthorized = (message = 'Session expirée ou invalide.') =>
  new ApiError(401, message);
export const forbidden = (message = 'Action non autorisée.') => new ApiError(403, message);
export const notFound = (message = 'Introuvable.') => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Exécute le corps d'une route et convertit toute erreur en réponse JSON. */
export async function handle(
  fn: () => Promise<NextResponse> | NextResponse
): Promise<NextResponse> {
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
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return ((await request.json()) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}
