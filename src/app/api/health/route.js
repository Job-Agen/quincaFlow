import { getSql } from '../../../lib/db';

/**
 * Sonde de santé, pour la supervision externe.
 *
 * Elle interroge réellement la base : un service qui répond alors que Neon est
 * injoignable est en panne du point de vue du commerçant, même si le processus
 * tourne. La réponse ne dit rien de la configuration ni de la version — une
 * sonde publique n'a pas à renseigner qui cherche une prise.
 */
export async function GET() {
  try {
    await getSql()`SELECT 1`;
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'degraded' }, { status: 503 });
  }
}

export const dynamic = 'force-dynamic';
