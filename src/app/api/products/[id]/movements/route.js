import { handle, json } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { productMovements } from '../../../../../server/products';

export async function GET(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await productMovements(session.businessId, id));
  });
}
