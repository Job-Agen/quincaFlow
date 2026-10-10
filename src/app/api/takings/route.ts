import type { NextRequest } from 'next/server';
import { handle, json } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { periodBounds } from '../../../server/history';
import { takingsBook } from '../../../server/incomes';

/**
 * Le cahier de recettes d'une période (§42).
 *
 * Ouvert au vendeur comme au propriétaire : il ne montre que ce qui est entré,
 * jamais une marge ni un coût. C'est ce qui le distingue des rapports (§39) et
 * du journal de caisse (§40), réservés au propriétaire.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireAuth();
    const { fromDate, toDate } = periodBounds(
      request.nextUrl.searchParams.get('period') || 'month'
    );
    return json(await takingsBook(session.businessId, { fromDate, toDate }));
  });
}
