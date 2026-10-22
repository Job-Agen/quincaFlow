import { handle, json } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { categories } from '../../../../server/products';

/**
 * Les rayons du catalogue (§52).
 *
 * Accessible au vendeur : c'est avec cette liste qu'il filtre le catalogue au
 * comptoir. Elle ne porte aucun prix, rien de ce que le §5 lui cache.
 */
export async function GET() {
  return handle(async () => json(await categories((await requireAuth()).businessId)));
}
