import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { clearSessionCookies, readRefreshCookie, revokeRefreshToken } from '../../../../lib/auth';

/**
 * Déconnexion : le refresh token est réellement révoqué en base, pas seulement
 * oublié. Une application native envoie le sien dans le corps, faute de cookie
 * à présenter (§41) — sans quoi sa session resterait ouverte côté serveur.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    await revokeRefreshToken(await readRefreshCookie(await readBody(request)));
    await clearSessionCookies();
    return json({ ok: true });
  });
}
