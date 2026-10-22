import { handle, json } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { stockValue } from '../../../../server/products';

/**
 * Valeur du stock (§49).
 *
 * Réservé au propriétaire : la valeur au coût révèle les prix d'achat, que le
 * §5 ne montre pas au vendeur.
 */
export async function GET() {
  return handle(async () => json(await stockValue((await requireOwner()).businessId)));
}
