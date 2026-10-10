import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../lib/http';
import { requireOwner } from '../../../lib/auth';
import { periodBounds } from '../../../server/history';
import { createExpense, listExpenses } from '../../../server/expenses';

/** Dépenses de la boutique (§39). Le propriétaire seul les voit et les saisit (§5). */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireOwner();
    const { fromDate, toDate } = periodBounds(
      request.nextUrl.searchParams.get('period') || 'month'
    );
    return json(await listExpenses(session.businessId, { fromDate, toDate }));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () =>
    json(await createExpense(await requireOwner(), await readBody(request)), 201)
  );
}
