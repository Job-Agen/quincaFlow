import type { NextRequest } from 'next/server';
import { handle, json } from '../../../lib/http';
import { requireOwner } from '../../../lib/auth';
import { periodBounds } from '../../../server/history';
import { cashJournal } from '../../../server/cash';

/**
 * Journal de caisse d'une période (§40).
 *
 * Réservé au propriétaire : le journal donne les salaires de toute l'équipe et
 * le loyer de la boutique (§5).
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireOwner();
    const params = request.nextUrl.searchParams;
    const bounds = periodBounds(params.get('period') || 'month');
    const sens = params.get('direction');
    return json(
      await cashJournal(session.businessId, {
        ...bounds,
        direction: sens === 'IN' || sens === 'OUT' ? sens : undefined,
      })
    );
  });
}
