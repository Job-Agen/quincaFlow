import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { clesVapid, removeSubscription, saveSubscription } from '../../../../server/push';

/**
 * L'abonnement d'un navigateur aux rappels (§68).
 *
 * Ouvert au vendeur comme au propriétaire : c'est le navigateur qu'on abonne,
 * et ce que le rappel dira dépendra de ce que la boutique doit — pas de qui
 * s'est abonné.
 */
export async function GET() {
  return handle(async () => {
    await requireAuth();
    const cles = clesVapid();
    // La clé publique n'est pas un secret : le navigateur en a besoin pour
    // s'abonner. Son absence dit que la fonctionnalité n'est pas configurée.
    return json({ disponible: Boolean(cles), cle: cles?.publique ?? null });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () =>
    json(await saveSubscription(await requireAuth(), await readBody(request)), 201)
  );
}

export async function DELETE(request: NextRequest) {
  return handle(async () =>
    json(await removeSubscription(await requireAuth(), await readBody(request)))
  );
}
