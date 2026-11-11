import type { NextRequest } from 'next/server';
import { handle, json, unauthorized } from '../../../../lib/http';
import { envoyerRappelsDuJour } from '../../../../server/push';

/**
 * Le rappel quotidien des charges échues (§68).
 *
 * Appelée par le déclencheur de l'hébergeur, jamais par un écran. Elle touche
 * **toutes les boutiques** : c'est la seule route de l'application qui ne
 * porte pas de session, et c'est pourquoi elle est gardée par un secret.
 *
 * Sans `CRON_SECRET`, elle refuse tout le monde plutôt que de s'ouvrir : une
 * route qui réveille tous les téléphones de tous les gérants ne doit pas
 * dépendre d'une variable qu'on a oublié de poser.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || '';
    const presente = request.headers.get('authorization') || '';
    if (!secret || presente !== `Bearer ${secret}`) throw unauthorized('Accès refusé.');

    // Le jour est lu ici et passé plus bas : deux lectures d'horloge dans le
    // même traitement pourraient tomber de part et d'autre de minuit.
    const maintenant = new Date();
    const jour = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(maintenant.getDate()).padStart(2, '0')}`;

    return json({ jour, ...(await envoyerRappelsDuJour(jour)) });
  });
}
