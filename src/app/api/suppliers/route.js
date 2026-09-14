import { handle, json, readBody } from '../../../lib/http';
import { requireAuth, requireOwner } from '../../../lib/auth';
import { createContact, listContacts } from '../../../server/contacts';

export async function GET(request) {
  return handle(async () => {
    const session = await requireAuth();
    return json(
      await listContacts(session.businessId, 'suppliers', {
        search: request.nextUrl.searchParams.get('search') || '',
      })
    );
  });
}

export async function POST(request) {
  return handle(async () =>
    json(await createContact(await requireOwner(), 'suppliers', await readBody(request)), 201)
  );
}
