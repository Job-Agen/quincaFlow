import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { enregistrerLot } from '../../../../server/sales';

/**
 * Plusieurs ventes d'un coup (§75).
 *
 * Ouvert au vendeur comme au propriétaire : rattraper le cahier du comptoir
 * est le métier du comptoir, et chaque vente écrite l'est au nom de celui qui
 * la saisit, comme par l'écran ordinaire.
 *
 * Rend 200 même quand une vente du lot a buté : la réponse porte la liste de
 * ce qui est passé et le rang de ce qui a échoué. Une erreur HTTP effacerait
 * cette liste, et le gérant ressaisirait des ventes déjà enregistrées.
 */
export async function POST(request: NextRequest) {
  return handle(async () =>
    json(await enregistrerLot(await requireAuth(), await readBody(request)), 201)
  );
}
