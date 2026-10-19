import type { NextRequest } from 'next/server';
import { handle, json } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { debtors } from '../../../server/credit';

/** Classement des principaux débiteurs (§45). */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireAuth();
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 5;
    return json(await debtors(session.businessId, Math.min(Math.max(limit, 1), 20)));
  });
}
