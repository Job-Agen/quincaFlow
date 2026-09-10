import { handle, json, readBody } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { createOutOfStockSale, listOutOfStockSales } from '../../../server/outOfStock';
import { periodBounds } from '../../../server/history';

export async function GET(request) {
  return handle(async () => {
    const session = await requireAuth();
    const params = request.nextUrl.searchParams;
    const { from, to } = periodBounds(params.get('period') || 'all');
    return json(
      await listOutOfStockSales(session.businessId, {
        from,
        to,
        search: params.get('search') || '',
      })
    );
  });
}

export async function POST(request) {
  return handle(async () =>
    json(await createOutOfStockSale(await requireAuth(), await readBody(request)), 201)
  );
}
