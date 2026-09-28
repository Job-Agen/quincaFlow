import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { advanceOutOfStockSale, getOutOfStockSale } from '../../../../server/outOfStock';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getOutOfStockSale(session.businessId, id));
  });
}

/** Fait avancer l'opération d'une étape du workflow hors stock (§17). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await advanceOutOfStockSale(session, id, await readBody(request)));
  });
}
