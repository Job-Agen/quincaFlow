import type { NextRequest } from 'next/server';
import { handle, json } from '../../../lib/http';
import { requireOwner } from '../../../lib/auth';
import { periodBounds } from '../../../server/history';
import { financialReport } from '../../../server/reports';

/**
 * Rapport financier d'une période (§39).
 *
 * Réservé au propriétaire : salaires, loyer et bénéfice net ne figurent pas dans
 * ce dont un vendeur a besoin pour vendre (§5).
 *
 * Tout l'écran tient dans cette réponse — résultat, dépenses par poste, ventes
 * par tranche, rentabilité par produit. Sur une connexion de comptoir, quatre
 * allers-retours coûtent plus cher que les quatre agrégats réunis (§35).
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requireOwner();
    const bounds = periodBounds(request.nextUrl.searchParams.get('period') || 'month');
    return json(await financialReport(session.businessId, bounds));
  });
}
