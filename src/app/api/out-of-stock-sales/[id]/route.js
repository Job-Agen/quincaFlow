import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { advanceOutOfStockSale, getOutOfStockSale } from '../../../../server/outOfStock';

export async function GET(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getOutOfStockSale(session.businessId, id));
  });
}

/** Fait avancer l'opération d'une étape du workflow hors stock (§17). */
export async function PATCH(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await advanceOutOfStockSale(session, id, await readBody(request)));
  });
}
