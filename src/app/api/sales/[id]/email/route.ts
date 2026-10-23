import type { NextRequest } from 'next/server';
import { badRequest, handle, json, readBody } from '../../../../../lib/http';
import { requireAuth } from '../../../../../lib/auth';
import { emailSale } from '../../../../../server/invoiceMail';

/**
 * Envoie la facture par courriel, en pièce jointe (§57).
 *
 * Accessible au vendeur : une facture ne porte aucun prix d'achat, et c'est
 * souvent lui qui tient le comptoir quand le client réclame son document.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    const body = await readBody(request);
    const destinataire = typeof body.to === 'string' ? body.to.trim() : '';
    if (!destinataire) throw badRequest('Indiquez l’adresse du destinataire.');
    return json(await emailSale(session, id, destinataire));
  });
}
