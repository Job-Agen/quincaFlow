import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth, requireOwner } from '../../../../lib/auth';
import { getPurchaseOrder, updatePurchaseOrderStatus } from '../../../../server/purchases';

export async function GET(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getPurchaseOrder(session.businessId, id));
  });
}

export async function PATCH(request, { params }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await updatePurchaseOrderStatus(session, id, await readBody(request)));
  });
}
