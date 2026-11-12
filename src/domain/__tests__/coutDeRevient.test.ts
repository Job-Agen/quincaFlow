import { describe, expect, it } from 'vitest';
import { coutDeRevient, weightedAverageCost } from '../units';

/**
 * Le coût d'une marchandise rendue en boutique (§69).
 *
 * C'est de ce nombre que dépendent toutes les marges. Une erreur ici ne se
 * voit nulle part à l'écran : elle se lit des mois plus tard, dans un
 * bénéfice qui n'a jamais existé.
 */

describe('le transport entre dans le coût', () => {
  it('se répartit sur la quantité reçue', () => {
    // 50 sacs à 3 900 et 10 000 de camion : 200 de transport par sac.
    expect(coutDeRevient(3900, 50, 1, 10000)).toBe(4100);
  });

  it('se ramène à l’unité de base, comme le reste', () => {
    // 10 cartons de 40 pièces à 17 000, et 8 000 de transport.
    // Marchandise : 170 000 pour 400 pièces, soit 425. Transport : 20.
    expect(coutDeRevient(17000, 10, 40, 8000)).toBe(445);
  });

  it('rend le prix d’achat quand il n’y a pas de transport', () => {
    expect(coutDeRevient(3900, 50, 1)).toBe(3900);
    expect(coutDeRevient(3900, 50, 1, 0)).toBe(3900);
    expect(coutDeRevient(17000, 10, 40, 0)).toBe(425);
  });

  it('ignore un transport négatif plutôt que de rendre de l’argent', () => {
    expect(coutDeRevient(3900, 50, 1, -10000)).toBe(3900);
  });

  it('ne divise pas par zéro', () => {
    // Aucune quantité reçue : rien à répartir, et surtout pas d'infini.
    expect(coutDeRevient(3900, 0, 1, 10000)).toBe(3900);
    expect(coutDeRevient(17000, 0, 40, 8000)).toBe(425);
  });

  it('arrive bien dans la moyenne pondérée', () => {
    // 100 pièces détenues à 300, on en reçoit 400 à 320 avec 4 000 de camion :
    // le transport fait 10 par pièce, donc 330 rendu — et la moyenne suit.
    const revient = coutDeRevient(320, 400, 1, 4000);
    expect(revient).toBe(330);
    expect(weightedAverageCost(100, 300, 400, revient)).toBe(324);
  });
});
