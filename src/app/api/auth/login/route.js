import { handle, json, readBody } from '../../../../lib/http';
import { issueRefreshToken, setSessionCookies, signAccessToken } from '../../../../lib/auth';
import { authenticate, profile } from '../../../../server/accounts';

export async function POST(request) {
  return handle(async () => {
    const session = await authenticate(await readBody(request));
    await setSessionCookies({
      accessToken: await signAccessToken(session),
      refreshToken: await issueRefreshToken(session.userId, session.businessId),
    });
    return json(await profile(session));
  });
}
