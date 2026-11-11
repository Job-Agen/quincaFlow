import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../lib/http';
import { requireOwner } from '../../../lib/auth';
import { createCharge, listCharges } from '../../../server/charges';

/**
 * Charges récurrentes (§66). Le propriétaire seul les voit et les saisit (§5) :
 * un salaire ou un loyer n'est pas l'affaire d'un vendeur au comptoir.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireOwner();
    const inactives = request.nextUrl.searchParams.get('inactives') === '1';
    return json(await listCharges(session.businessId, { inactives }));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () =>
    json(await createCharge(await requireOwner(), await readBody(request)), 201)
  );
}
