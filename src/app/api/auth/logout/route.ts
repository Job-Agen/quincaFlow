import { handle, json } from '../../../../lib/http';
import { clearSessionCookies, readRefreshCookie, revokeRefreshToken } from '../../../../lib/auth';

/** Déconnexion : le refresh token est réellement révoqué en base, pas seulement oublié. */
export async function POST() {
  return handle(async () => {
    await revokeRefreshToken(await readRefreshCookie());
    await clearSessionCookies();
    return json({ ok: true });
  });
}
