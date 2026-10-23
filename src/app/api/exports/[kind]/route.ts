import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handle } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { EXPORTS, backup, exportRequest, isExportKind } from '../../../../server/exports';
import { exportFileName } from '../../../../domain/csv';
import { notFound } from '../../../../lib/http';

/**
 * Télécharge un export (§48).
 *
 *   /api/exports/stocks      inventaire et valeur du stock
 *   /api/exports/ventes      historique détaillé, une ligne par article
 *   /api/exports/clients     fichier clients et carnet de crédit
 *   /api/exports/rapport     compte de résultat de la période (§55)
 *   /api/exports/rentabilite marge par produit sur la période (§55)
 *   /api/exports/sauvegarde  tout, en JSON
 *
 * Les deux derniers lisent `?period=`, comme l'écran Rapports : sans lui, le
 * fichier porterait le mois en cours alors que l'écran montrait l'an dernier.
 *
 * Réservé au propriétaire : ces fichiers portent les prix d'achat et les
 * marges, que le §5 ne montre pas au vendeur. Les laisser sortir par une
 * adresse ouverte à tous contournerait la règle de l'écran.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { kind } = await params;

    if (kind === 'sauvegarde') {
      return fichier(
        JSON.stringify(await backup(session), null, 2),
        exportFileName('sauvegarde', new Date(), 'json'),
        'application/json; charset=utf-8'
      );
    }

    if (!isExportKind(kind)) throw notFound('Export inconnu.');
    const { bounds, fileName } = exportRequest(kind, request.nextUrl.searchParams.get('period'));
    return fichier(
      await EXPORTS[kind](session.businessId, bounds),
      fileName,
      // `text/csv` et rien d'autre : un `application/octet-stream` ferait
      // proposer « ouvrir avec… » au lieu du tableur.
      'text/csv; charset=utf-8'
    );
  });
}

/**
 * La réponse qui fait télécharger plutôt qu'afficher.
 *
 * `attachment` porte le nom du fichier ; sans lui, le navigateur l'enregistre
 * sous le nom de la route — « clients » sans extension, que rien n'ouvre.
 */
function fichier(contenu: string, nom: string, type: string): NextResponse {
  return new NextResponse(contenu, {
    headers: {
      'content-type': type,
      'content-disposition': `attachment; filename="${nom}"`,
      // Un export est daté : le remettre en cache servirait celui d'hier.
      'cache-control': 'no-store',
    },
  });
}
