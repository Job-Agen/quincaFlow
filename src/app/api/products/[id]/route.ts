import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth, requireOwner } from '../../../../lib/auth';
import { archiveProduct, getProduct, updateProduct } from '../../../../server/products';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getProduct(session.businessId, id));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await updateProduct(session, id, await readBody(request)));
  });
}

/** Archive plutôt que supprimer : l'historique comptable garde ses références (§9). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    await archiveProduct(session, id);
    return json({ ok: true });
  });
}
