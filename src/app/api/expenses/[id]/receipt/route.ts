import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../../lib/http';
import { requireOwner } from '../../../../../lib/auth';
import { attachReceipt, deleteReceipt, getReceipt } from '../../../../../server/expenses';

/**
 * Justificatif d'une dépense (§40).
 *
 * Route séparée de la dépense elle-même, et c'est le point : l'image ne voyage
 * que lorsqu'on la demande. La liste des dépenses n'indique que son existence.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await context.params;
    return json(await getReceipt(session.businessId, id));
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await attachReceipt(await requireOwner(), id, await readBody(request)), 201);
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await deleteReceipt(await requireOwner(), id));
  });
}
