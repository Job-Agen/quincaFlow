import { handle, json } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { customerAccount } from '../../../../../server/credit';

/** Fiche client : achats, dette en cours et historique des versements (§45). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await customerAccount(session.businessId, id));
  });
}
