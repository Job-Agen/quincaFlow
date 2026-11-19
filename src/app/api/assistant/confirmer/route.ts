import type { NextRequest } from 'next/server';
import { handle, json, readBody, badRequest } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { executer } from '../../../../server/assistant';

/**
 * Le geste que le gérant vient de valider (§71).
 *
 * C'est le seul chemin par lequel l'assistant écrit, et il n'existe que parce
 * qu'un humain a appuyé. Les arguments arrivent du client — comme pour
 * n'importe quel écran —, et comme pour n'importe quel écran ils passent par
 * les fonctions de service : mêmes validations, même isolation, mêmes refus.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requireAuth();
    const corps = await readBody(request);
    const outil = String(corps.outil || '');
    if (!outil) throw badRequest('Action manquante.');
    const args = (corps.args || {}) as Record<string, unknown>;
    return json({ texte: await executer(session, outil, args) });
  });
}
