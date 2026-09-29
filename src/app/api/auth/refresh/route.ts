import { handle, json, unauthorized } from '../../../../lib/http';
import {
  readRefreshCookie,
  rotateRefreshToken,
  setSessionCookies,
  signAccessToken,
} from '../../../../lib/auth';
import { profile } from '../../../../server/accounts';

/**
 * Renouvelle l'access token à partir du refresh token.
 *
 * Le refresh token est remplacé au passage : un jeton ne sert qu'une fois, ce
 * qui rend un jeton volé inutilisable dès que le vrai navigateur s'est
 * rafraîchi.
 */
export async function POST() {
  return handle(async () => {
    const rotated = await rotateRefreshToken(await readRefreshCookie());
    if (!rotated) throw unauthorized();

    const session = {
      userId: rotated.member.id,
      businessId: rotated.member.business_id,
      role: rotated.member.role,
      name: rotated.member.name,
    };
    await setSessionCookies({
      accessToken: await signAccessToken(session),
      refreshToken: rotated.refreshToken,
    });
    return json(await profile(session));
  });
}
