'use client';

import { amount, money } from '@/utils/format';
import type { DashboardDay } from '@/types';

/**
 * Les sept derniers jours, en barres (§49).
 *
 * Le §8 refuse les « graphiques complexes » sur le tableau de bord, et il a
 * raison : on vient y chercher la journée, pas une analyse. Sept barres ne sont
 * pas une analyse — elles répondent à la seule question qu'une colonne de
 * chiffres du jour ne sait pas poser : est-ce que ça monte ou ça descend ?
 *
 * Mêmes partis pris que les deux autres graphiques de l'application : aucune
 * bibliothèque, une seule teinte — il n'y a qu'une grandeur mesurée —, et la
 * barre ne porte rien que le texte ne dise. Le jour est écrit sous chaque
 * barre, le total de la semaine au-dessus, et la journée la plus forte est la
 * seule chiffrée : sept montants à six chiffres ne tiennent pas sur 390 px, et
 * les empiler les rendrait tous illisibles.
 */

/**
 * Le jour en trois lettres : lun, mar, mer…
 *
 * L'initiale seule aurait été plus courte, mais « M » désigne aussi bien mardi
 * que mercredi : deux barres voisines portaient la même étiquette, et plus rien
 * ne disait laquelle était laquelle.
 */
function initiale(jourISO: string): string {
  return new Date(`${jourISO}T12:00:00Z`)
    .toLocaleDateString('fr-FR', { weekday: 'short' })
    .replace('.', '');
}

export default function SemaineChart({
  week,
  currency,
}: {
  week: readonly DashboardDay[];
  currency: string;
}) {
  const sommet = Math.max(...week.map((jour) => jour.revenue), 0);
  const total = week.reduce((somme, jour) => somme + jour.revenue, 0);
  const meilleur = week.reduce(
    (garde, jour) => (jour.revenue > (garde?.revenue ?? -1) ? jour : garde),
    null as DashboardDay | null
  );

  // La description remplace le graphique pour qui ne le voit pas : elle porte
  // les mêmes chiffres, dans le même ordre.
  const description = week
    .map((jour) => `${initiale(jour.day)} ${money(jour.revenue, currency)}`)
    .join(', ');

  return (
    <div className="semaine">
      <div className="semaine__total">
        <span className="small muted">Sept derniers jours</span>
        <strong className="num">{money(total, currency)}</strong>
      </div>

      <div className="semaine__barres" role="img" aria-label={`Ventes par jour : ${description}`}>
        {week.map((jour) => {
          const part = sommet > 0 ? jour.revenue / sommet : 0;
          return (
            <div key={jour.day} className="semaine__jour">
              <span className="semaine__valeur small">
                {meilleur && jour.day === meilleur.day && jour.revenue > 0
                  ? amount(jour.revenue, 0)
                  : ''}
              </span>
              <span className="semaine__rail" aria-hidden="true">
                {/* Deux pixels de fond restent visibles pour un jour sans
                  vente : une barre absente se lirait comme une donnée absente. */}
                <span
                  className="semaine__barre"
                  style={{ height: `${Math.max(2, part * 100)}%` }}
                />
              </span>
              <span className="semaine__libelle small muted">{initiale(jour.day)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
