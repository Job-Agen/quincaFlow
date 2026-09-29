import type { NextRequest } from 'next/server';
import { handle, json, readBody, unauthorized } from '../../../../lib/http';
import { readRefreshCookie, rotateRefreshToken, signAccessToken } from '../../../../lib/auth';
import { respondWithSession } from '../../../../lib/session';
import { profile } from '../../../../server/accounts';

/**
 * Renouvelle l'access token à partir du refresh token.
 *
 * Le refresh token est remplacé au passage : un jeton ne sert qu'une fois, ce
 * qui rend un jeton volé inutilisable dès que le vrai client s'est rafraîchi.
 *
 * Le navigateur envoie le sien en cookie ; une application native le passe dans
 * le corps, n'ayant pas de cookie à présenter (§41).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const rotated = await rotateRefreshToken(await readRefreshCookie(await readBody(request)));
    if (!rotated) throw unauthorized();

    const session = {
      userId: rotated.member.id,
      businessId: rotated.member.business_id,
      role: rotated.member.role,
      name: rotated.member.name,
    };
    return json(
      await respondWithSession(request, await profile(session), {
        accessToken: await signAccessToken(session),
        refreshToken: rotated.refreshToken,
      })
    );
  });
}
