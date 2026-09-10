import { handle, json, readBody } from '../../../lib/http';
import { requireOwner } from '../../../lib/auth';
import { updateBusiness } from '../../../server/accounts';

/** Coordonnées de la boutique : elles figurent sur chaque facture (§15). */
export async function PATCH(request) {
  return handle(async () =>
    json(await updateBusiness(await requireOwner(), await readBody(request)))
  );
}
