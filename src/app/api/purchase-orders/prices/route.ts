import { handle, json } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { derniersPrix } from '../../../../server/purchases';

/**
 * Le dernier prix commandé, marchandise par marchandise (§74).
 *
 * Nourrit la comparaison de l'écran de commande : « vous payiez 3 900 le
 * 12 octobre ». Réservé au propriétaire, comme tout ce qui touche aux prix
 * d'achat (§5).
 */
export async function GET() {
  return handle(async () => json(await derniersPrix((await requireOwner()).businessId)));
}
