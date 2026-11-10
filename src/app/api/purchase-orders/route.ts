import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../lib/http';
import { requireAuth, requireOwner } from '../../../lib/auth';
import { createPurchaseOrder, listPurchaseOrders } from '../../../server/purchases';
import { periodBounds } from '../../../server/history';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireAuth();
    const params = request.nextUrl.searchParams;
    return json(
      await listPurchaseOrders(session.businessId, {
        search: params.get('search') || '',
        statut: params.get('statut') || '',
        ...periodBounds(params.get('period')),
      })
    );
  });
}

export async function POST(request: NextRequest) {
  return handle(async () =>
    json(await createPurchaseOrder(await requireOwner(), await readBody(request)), 201)
  );
}
