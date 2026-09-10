import { handle, json, readBody } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { createPurchaseOrder, listPurchaseOrders } from '../../../server/purchases';

export async function GET(request) {
  return handle(async () => {
    const session = await requireAuth();
    return json(
      await listPurchaseOrders(session.businessId, {
        search: request.nextUrl.searchParams.get('search') || '',
      })
    );
  });
}

export async function POST(request) {
  return handle(async () =>
    json(await createPurchaseOrder(await requireAuth(), await readBody(request)), 201)
  );
}
