import type { NextRequest } from 'next/server';
import { ApiError, handle, json, readBody } from '../../../../lib/http';
import { mintTokens, respondWithSession } from '../../../../lib/session';
import { guardLogin, recordFailedLogin } from '../../../../lib/throttle';
import { authenticate, profile } from '../../../../server/accounts';

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readBody(request);
    const identifier = typeof body.identifier === 'string' ? body.identifier : '';

    // Le freinage précède la vérification : sans cela, chaque essai coûterait
    // un bcrypt complet au serveur avant d'être éventuellement refusé.
    await guardLogin(identifier, request);

    let session;
    try {
      session = await authenticate(body);
    } catch (error) {
      // Seul un échec d'identification est compté : une saisie malformée ou une
      // panne de base ne doit pas fermer l'accès d'un vendeur de bonne foi.
      if (error instanceof ApiError && error.status === 401) {
        await recordFailedLogin(identifier, request);
      }
      throw error;
    }

    return json(
      await respondWithSession(request, await profile(session), await mintTokens(session))
    );
  });
}
