import { handle, json, readBody } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { cancelSale } from '../../../../../server/sales';

/** Annule la vente et restitue le stock par un mouvement inverse (§25). */
export async function POST(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    const body = await readBody(request);
    return json(await cancelSale(session, id, body.reason));
  });
}
