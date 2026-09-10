import { handle, json, readBody } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { createProduct, listProducts } from '../../../server/products';

export async function GET(request) {
  return handle(async () => {
    const session = await requireAuth();
    const params = request.nextUrl.searchParams;
    return json(
      await listProducts(session.businessId, {
        search: params.get('search') || '',
        filter: params.get('filter') || 'all',
      })
    );
  });
}

export async function POST(request) {
  return handle(async () =>
    json(await createProduct(await requireAuth(), await readBody(request)), 201)
  );
}
