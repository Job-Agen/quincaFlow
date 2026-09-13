import { handle, json, readBody } from '../../../../lib/http';
import {
  issueRefreshToken,
  requireAuth,
  setSessionCookies,
  signAccessToken,
} from '../../../../lib/auth';
import { changePassword } from '../../../../server/accounts';

/**
 * Changement de mot de passe (§7).
 *
 * Le changement révoque toutes les sessions de l'utilisateur, y compris
 * celle-ci : de nouveaux cookies sont donc réémis avant de répondre, faute de
 * quoi la personne serait déconnectée par son propre geste.
 */
export async function PATCH(request) {
  return handle(async () => {
    const session = await requireAuth();
    await changePassword(session, await readBody(request));
    await setSessionCookies({
      accessToken: await signAccessToken(session),
      refreshToken: await issueRefreshToken(session.userId, session.businessId),
    });
    return json({ ok: true });
  });
}
