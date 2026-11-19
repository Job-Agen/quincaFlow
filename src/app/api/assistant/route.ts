import type { NextRequest } from 'next/server';
import { handle, json, readBody, badRequest } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { repondre, type Tour } from '../../../server/assistant';

/**
 * L'assistant de la boutique (§71).
 *
 * Ouvert au vendeur comme au propriétaire : c'est la session qui décide de ce
 * que l'assistant sait faire, pas la route. Un vendeur peut lui demander une
 * vente, pas les bénéfices.
 *
 * Rien ne s'écrit par ce chemin : il comprend la question et, au besoin,
 * décrit le geste à venir. Seule la route de confirmation écrit, à travers
 * les mêmes fonctions et les mêmes refus que les écrans ordinaires.
 */
const MAX_TOURS_GARDES = 40;

export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requireAuth();
    const corps = await readBody(request);
    if (!Array.isArray(corps.tours)) throw badRequest('Conversation manquante.');
    // Un fil sans borne ferait grossir la facture du gérant sans qu'il le
    // voie : au-delà, l'écran repart d'une conversation neuve.
    const tours = (corps.tours as Record<string, unknown>[])
      .slice(-MAX_TOURS_GARDES)
      .map((tour) => ({
        role: tour.role === 'assistant' ? 'assistant' : 'user',
        texte: String(tour.texte || '').slice(0, 4000),
      })) as Tour[];
    return json(await repondre(session, tours));
  });
}
