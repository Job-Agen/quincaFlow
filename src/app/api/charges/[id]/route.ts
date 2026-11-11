import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { deleteCharge, getCharge, updateCharge } from '../../../../server/charges';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await context.params;
    return json(await getCharge(session.businessId, id));
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await updateCharge(await requireOwner(), id, await readBody(request)));
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    await deleteCharge(await requireOwner(), id);
    return json({ id });
  });
}
