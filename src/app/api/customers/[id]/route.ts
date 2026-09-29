import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { getContact, updateContact } from '../../../../server/contacts';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getContact(session.businessId, 'customers', id));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await updateContact(session, 'customers', id, await readBody(request)));
  });
}
