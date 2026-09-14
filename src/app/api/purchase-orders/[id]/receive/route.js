import { handle, json, readBody } from '../../../../../lib/http';
import { requireOwner } from '../../../../../lib/auth';
import { receivePurchaseOrder } from '../../../../../server/purchases';

/** Réception : c'est ici, et seulement ici, que le stock d'un achat augmente (§21). */
export async function POST(request, { params }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await receivePurchaseOrder(session, id, await readBody(request)));
  });
}
