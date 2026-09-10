import { handle, json, readBody } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { attachDocument } from '../../../../../server/purchases';

export async function POST(request, { params }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await attachDocument(session, id, await readBody(request)), 201);
  });
}
