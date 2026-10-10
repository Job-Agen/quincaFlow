import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { periodBounds } from '../../../server/history';
import { createIncome, listIncomes } from '../../../server/incomes';

/**
 * Recettes hors vente (§42).
 *
 * `requireAuth` et non `requireOwner`, contrairement aux dépenses : l'argent
 * entre au comptoir, et interdire au vendeur de l'inscrire le ferait disparaître
 * — on perdrait la recette plutôt que de protéger quoi que ce soit. La frontière
 * du §5 porte sur les prix et les chiffres, pas sur la saisie d'un encaissement.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireAuth();
    const { fromDate, toDate } = periodBounds(
      request.nextUrl.searchParams.get('period') || 'month'
    );
    return json(await listIncomes(session.businessId, { fromDate, toDate }));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () =>
    json(await createIncome(await requireAuth(), await readBody(request)), 201)
  );
}
