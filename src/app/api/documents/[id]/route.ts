import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handle, json } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { deleteDocument, documentFile } from '../../../../server/purchases';
import { TYPES_ACCEPTES, nomDeFichier } from '../../../../domain/pieceJointe';

/**
 * Le fichier d'une pièce jointe (§59).
 *
 * Route séparée de la commande, et c'est le point : la fiche ne porte que le
 * nom et le poids de ses pièces ; les octets ne partent que lorsqu'on les
 * demande. Sans cela, ouvrir une commande à trois factures scannées coûterait
 * dix mégaoctets de données mobiles à chaque fois.
 *
 * Trois en-têtes font tout le travail de sécurité. Le type déclaré vient de
 * notre liste et non du fichier ; `nosniff` empêche le navigateur de deviner
 * autre chose ; et tout ce qui n'est pas un PDF ou une photo se télécharge au
 * lieu de s'afficher. Un document servi depuis notre propre domaine, avec son
 * propre type et affiché en place, exécuterait son script chez nous.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await context.params;
    const piece = await documentFile(session.businessId, id);

    const type = TYPES_ACCEPTES[piece.mime];
    const octets = Buffer.from(piece.contenu.slice(piece.contenu.indexOf(',') + 1), 'base64');
    const nom = nomDeFichier(piece.name, piece.mime);

    return new NextResponse(new Uint8Array(octets), {
      headers: {
        // Jamais le type lu dans le fichier : celui de notre liste, ou rien
        // de plus qu'un flot d'octets que le navigateur se contentera de
        // ranger. Un type inconnu ne devient pas un type deviné.
        'Content-Type': type ? piece.mime : 'application/octet-stream',
        'Content-Disposition': `${type?.enLigne ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nom)}`,
        'Content-Length': String(octets.length),
        'X-Content-Type-Options': 'nosniff',
        // La pièce appartient à une boutique : aucun intermédiaire ne doit en
        // garder une copie (§29).
        'Cache-Control': 'private, no-store',
      },
    });
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await context.params;
    await deleteDocument(session, id);
    return json({ id });
  });
}
