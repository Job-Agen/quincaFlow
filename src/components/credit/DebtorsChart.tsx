'use client';

import Link from 'next/link';
import { money } from '@/utils/format';
import type { RankedDebtor } from '@/domain/credit';

/**
 * Classement visuel des principaux débiteurs (§45).
 *
 * La question posée est « qui me doit le plus ? », et une colonne de montants y
 * répond mal : il faut les comparer un à un. Des barres de longueur
 * proportionnelle y répondent d'un regard.
 *
 * Quatre partis pris, dans l'esprit de l'anneau des dépenses (§40) :
 *
 * — **Aucune bibliothèque, et pas de SVG.** Une barre horizontale est une boîte
 *   large de n pour cent. Le HTML la dessine mieux qu'un SVG : le nom et le
 *   montant restent du texte sélectionnable, qui se redimensionne avec les
 *   réglages d'accessibilité du téléphone.
 * — **La barre ne porte aucune information seule.** Nom et montant sont écrits
 *   sur chaque ligne ; la barre est `aria-hidden`, et sa disparition — lecteur
 *   d'écran, impression en noir et blanc — ne retire rien.
 * — **Une seule teinte.** Il n'y a qu'une grandeur mesurée. Donner une couleur
 *   par client ferait croire à des catégories, et rien ne la rendrait stable
 *   d'un mois à l'autre.
 * — **La plus longue barre vaut la pleine largeur.** C'est `rankDebtors` qui
 *   calcule les parts ; l'écran ne fait que les poser.
 *
 * Chaque ligne est un lien vers la fiche du client : sur un téléphone, on ne
 * survole pas une barre, on la touche — et ce qu'on veut alors, c'est le
 * détail de la dette, pas une infobulle.
 */
export default function DebtorsChart({
  debtors,
  currency,
}: {
  debtors: readonly RankedDebtor[];
  currency: string;
}) {
  return (
    <ol className="debtors">
      {debtors.map((debiteur) => (
        <li key={debiteur.id}>
          <Link href={`/customers/${debiteur.id}`} className="debtors__row">
            <span className="debtors__name">{debiteur.name}</span>
            <span className="debtors__amount num">{money(debiteur.owed, currency)}</span>
            <span className="debtors__track" aria-hidden="true">
              <span
                className="debtors__bar"
                style={{ width: `${Math.max(2, debiteur.share * 100)}%` }}
              />
            </span>
            {debiteur.oldestDays !== null && debiteur.oldestDays >= 1 ? (
              <span className="debtors__age small muted">
                depuis {debiteur.oldestDays} jour{debiteur.oldestDays > 1 ? 's' : ''}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}
