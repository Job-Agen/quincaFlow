import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../lib/http';
import { clearSessionCookies, requireOwner } from '../../../lib/auth';
import { businessWeight, deleteBusiness, updateBusiness } from '../../../server/accounts';

/** Coordonnées de la boutique : elles figurent sur chaque facture (§15). */
export async function PATCH(request: NextRequest) {
  return handle(async () =>
    json(await updateBusiness(await requireOwner(), await readBody(request)))
  );
}

/** Ce que la boutique contient, pour l'annoncer avant de l'effacer (§46). */
export async function GET() {
  return handle(async () => json(await businessWeight(await requireOwner())));
}

/**
 * Supprime la boutique (§46).
 *
 * `requireOwner` plutôt que `requireAuth` : un vendeur ne ferme pas la
 * quincaillerie de son patron (§5). Les cookies sont vidés dans la foulée — le
 * jeton désigne un compte qui vient peut-être de disparaître, et le laisser
 * dans le navigateur ne mènerait qu'à des 401 incompréhensibles.
 */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const resume = await deleteBusiness(await requireOwner(), await readBody(request));
    await clearSessionCookies();
    return json(resume);
  });
}
