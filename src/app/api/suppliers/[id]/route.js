import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth, requireOwner } from '../../../../lib/auth';
import { getContact, supplierOrders, updateContact } from '../../../../server/contacts';

export async function GET(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    const [supplier, orders] = await Promise.all([
      getContact(session.businessId, 'suppliers', id),
      supplierOrders(session.businessId, id),
    ]);
    return json({ ...supplier, orders });
  });
}

export async function PATCH(request, { params }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await updateContact(session, 'suppliers', id, await readBody(request)));
  });
}
