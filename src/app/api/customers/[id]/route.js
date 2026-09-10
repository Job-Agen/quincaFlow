import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { getContact, updateContact } from '../../../../server/contacts';

export async function GET(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getContact(session.businessId, 'customers', id));
  });
}

export async function PATCH(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await updateContact(session, 'customers', id, await readBody(request)));
  });
}
