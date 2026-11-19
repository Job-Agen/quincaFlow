import type { NextRequest } from 'next/server';
import { handle, json, readBody, badRequest } from '../../../lib/http';
import { requireAuth } from '../../../lib/auth';
import { assistantConfigure, repondre, type Tour } from '../../../server/assistant';

/**
 * L'assistant de la boutique (§71).
 *
 * Ouvert au vendeur comme au propriétaire : c'est la session qui décide de ce
 * que l'assistant sait faire, pas la route. Un vendeur peut lui demander une
 * vente, pas les bénéfices.
 *
 * Le fil de la conversation est tenu par l'écran et renvoyé à chaque tour. Il
 * ne donne aucun pouvoir : rien ne s'écrit par ce chemin, et ce que le modèle
 * croit n'autorise rien — seule la route de confirmation écrit, à travers les
 * mêmes fonctions et les mêmes refus que les écrans ordinaires.
 */
export async function GET() {
  return handle(async () => {
    await requireAuth();
    return json({ disponible: assistantConfigure() });
  });
}

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
