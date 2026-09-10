import { handle, json } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { listHistory, periodBounds } from '../../../server/history';

/** Flux chronologique unifié : ventes, hors stock, commandes, réceptions (§24). */
export async function GET(request) {
  return handle(async () => {
    const session = await requireAuth();
    const params = request.nextUrl.searchParams;
    const { from, to } = periodBounds(params.get('period') || 'today');
    return json(
      await listHistory(session.businessId, {
        from,
        to,
        search: params.get('search') || '',
        kind: params.get('kind') || null,
      })
    );
  });
}
