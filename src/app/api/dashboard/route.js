import { handle, json } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { dashboard } from '../../../server/dashboard';

export async function GET() {
  return handle(async () => {
    const session = await requireAuth();
    return json(await dashboard(session.businessId));
  });
}
