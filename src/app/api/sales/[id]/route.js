import { handle, json } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { getSale } from '../../../../server/sales';

export async function GET(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getSale(session.businessId, id));
  });
}
