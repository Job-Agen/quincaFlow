import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { updateLogo } from '../../../../server/accounts';

/**
 * Le logo de la boutique (§51).
 *
 * Propriétaire seulement : l'en-tête d'une facture engage le commerce, un
 * vendeur n'a pas à le réécrire (§5). Route distincte des coordonnées parce
 * qu'une image pèse mille fois le reste du formulaire — la joindre à chaque
 * changement de numéro de téléphone ferait transiter le logo pour rien.
 */
export async function PUT(request: NextRequest) {
  return handle(async () => json(await updateLogo(await requireOwner(), await readBody(request))));
}
