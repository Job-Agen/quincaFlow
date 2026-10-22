import { handle, json } from '../../../lib/http';
import { requireOwner } from '../../../lib/auth';
import { supplierDebts } from '../../../server/purchases';

/** Ce qui reste dû à chaque fournisseur (§53). Propriétaire seulement (§5). */
export async function GET() {
  return handle(async () => json(await supplierDebts((await requireOwner()).businessId)));
}
