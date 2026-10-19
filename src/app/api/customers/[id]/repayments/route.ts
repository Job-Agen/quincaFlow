import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { recordRepayment } from '../../../../../server/credit';

/**
 * Encaisse un remboursement de dette (§45).
 *
 * Ouvert au vendeur comme au propriétaire : c'est au comptoir que le client
 * rapporte l'argent, et le vendeur qui le reçoit doit pouvoir l'inscrire tout
 * de suite. L'écrire plus tard, c'est ne pas l'écrire.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await recordRepayment(session, id, await readBody(request)), 201);
  });
}
