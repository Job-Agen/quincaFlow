import { handle, json, readBody } from '../../../../lib/http';
import { issueRefreshToken, setSessionCookies, signAccessToken } from '../../../../lib/auth';
import { profile, register } from '../../../../server/accounts';

/** Inscription : crée le compte, sa quincaillerie, et ouvre la session (§7). */
export async function POST(request) {
  return handle(async () => {
    const session = await register(await readBody(request));
    await setSessionCookies({
      accessToken: await signAccessToken(session),
      refreshToken: await issueRefreshToken(session.userId, session.businessId),
    });
    return json(await profile(session), 201);
  });
}
