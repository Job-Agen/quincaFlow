import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../../lib/http';
import { requireOwner } from '../../../../../lib/auth';
import { payCharge } from '../../../../../server/charges';

/**
 * Paiement d'une charge (§66) : une dépense est écrite, et le chrono relancé.
 * Route à part parce que ce n'est pas une modification de la charge — c'est un
 * fait qui lui arrive.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await payCharge(await requireOwner(), id, await readBody(request)), 201);
  });
}
