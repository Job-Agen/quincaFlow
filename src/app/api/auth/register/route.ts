import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { mintTokens, respondWithSession } from '../../../../lib/session';
import { profile, register } from '../../../../server/accounts';

/** Inscription : crée le compte, sa quincaillerie, et ouvre la session (§7). */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await register(await readBody(request));
    return json(
      await respondWithSession(request, await profile(session), await mintTokens(session)),
      201
    );
  });
}
