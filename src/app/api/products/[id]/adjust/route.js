import { handle, json, readBody } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { adjustStock } from '../../../../../server/products';

export async function POST(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await adjustStock(session, id, await readBody(request)));
  });
}
