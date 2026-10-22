import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../../lib/http';
import { requireOwner } from '../../../../../lib/auth';
import { recordSupplierPayment } from '../../../../../server/purchases';

/**
 * Règlement au fournisseur (§53).
 *
 * Propriétaire seulement, comme tout l'achat : c'est lui qui sort l'argent, et
 * le montant révèle les prix d'achat que le §5 cache au vendeur.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await recordSupplierPayment(session, id, await readBody(request)));
  });
}
