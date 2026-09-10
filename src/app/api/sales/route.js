import { handle, json, readBody } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { createSale, listSales } from '../../../server/sales';
import { periodBounds } from '../../../server/history';

export async function GET(request) {
  return handle(async () => {
    const session = await requireAuth();
    const params = request.nextUrl.searchParams;
    const { from, to } = periodBounds(params.get('period') || 'all');
    return json(
      await listSales(session.businessId, { from, to, search: params.get('search') || '' })
    );
  });
}

/** Validation d'une vente : transaction atomique côté serveur (§12). */
export async function POST(request) {
  return handle(async () =>
    json(await createSale(await requireAuth(), await readBody(request)), 201)
  );
}
