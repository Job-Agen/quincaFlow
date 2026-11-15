'use client';

import { decompte, phraseEcheance, type ChargeRow } from '@/domain/charge';

/**
 * Le chrono d'une charge (§70).
 *
 * « 30, 29, 28… » : le gérant veut voir fondre son délai, pas lire une date.
 * L'anneau montre ce qui reste du répit et se vide à mesure ; le nombre au
 * centre dit combien de jours.
 *
 * En retard, l'anneau se remplit au lieu de se vider : un anneau vide dirait
 * la même chose que « plus que zéro jour », et c'est justement ce qu'il faut
 * distinguer. Le nombre compte alors les jours de retard.
 */
const RAYON = 20;
const TOUR = 2 * Math.PI * RAYON;

export default function CompteARebours({
  charge,
  jour,
}: {
  charge: Pick<ChargeRow, 'next_due_on' | 'last_paid_on' | 'interval_months'>;
  jour: string;
}) {
  const { jours, part, etat } = decompte(charge, jour);
  const restant = etat === 'en-retard' ? 1 : 1 - part;

  return (
    <div
      className="rebours"
      data-etat={etat}
      role="img"
      aria-label={phraseEcheance(charge.next_due_on, jour)}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="rebours__piste" cx="24" cy="24" r={RAYON} />
        <circle
          className="rebours__arc"
          cx="24"
          cy="24"
          r={RAYON}
          strokeDasharray={TOUR}
          strokeDashoffset={TOUR * (1 - restant)}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <div className="rebours__nombre">
        <span>{Math.abs(jours)}</span>
        <span className="rebours__unite">j</span>
      </div>
    </div>
  );
}
