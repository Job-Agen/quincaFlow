import { describe, expect, it } from 'vitest';
import { ecartDePrix, phraseEcartDePrix, type DernierPrix } from '../purchase';

/**
 * Le prix a-t-il monté depuis la dernière fois ? (§74)
 *
 * Un fournisseur annonce rarement qu'il augmente. Ce que ces tests gardent,
 * c'est que la comparaison soit **juste** — car une fausse alerte, répétée,
 * apprend au gérant à ne plus la lire.
 */
describe('écart de prix (§74)', () => {
  const sac = { unitCost: 3900, unitFactor: 1 };

  it('voit la hausse, en francs et en pour cent', () => {
    const vu = ecartDePrix({ unitCost: 4100, unitFactor: 1 }, sac);
    expect(vu).toMatchObject({ sens: 'hausse', ecart: 200, avant: 3900, apres: 4100 });
    expect(vu?.pourcentage).toBeCloseTo(5.1, 1);
  });

  it('voit la baisse', () => {
    const vu = ecartDePrix({ unitCost: 3700, unitFactor: 1 }, sac);
    expect(vu).toMatchObject({ sens: 'baisse', ecart: -200 });
    expect(vu?.pourcentage).toBeCloseTo(-5.1, 1);
  });

  it('ne crie pas quand rien n’a bougé', () => {
    expect(ecartDePrix({ unitCost: 3900, unitFactor: 1 }, sac)).toMatchObject({
      sens: 'stable',
      ecart: 0,
    });
  });

  it('compare à conditionnement égal, pas à l’étiquette', () => {
    // Le piège qui justifie tout : le fournisseur passe du sac au carton de
    // 40 en même temps qu'il change son prix. 12 750 le carton, c'est 318,75
    // le sac — à comparer à 318,75, pas à 12 750.
    const carton = { unitCost: 12750, unitFactor: 40 };
    const piece = { unitCost: 318.75, unitFactor: 1 };
    expect(ecartDePrix(carton, piece)).toMatchObject({ sens: 'stable', ecart: 0 });

    // Et une vraie hausse derrière le changement de conditionnement se voit.
    const plusCher = { unitCost: 13000, unitFactor: 40 };
    const vu = ecartDePrix(plusCher, piece);
    expect(vu?.sens).toBe('hausse');
    expect(vu?.apres).toBe(325);
  });

  it('se tait quand il n’y a rien à comparer', () => {
    // Sans commande précédente, et sur un prix nul d'un côté : « −100 % » ne
    // veut rien dire, et une alerte qui ne veut rien dire s'ignore.
    expect(ecartDePrix({ unitCost: 4100, unitFactor: 1 }, null)).toBeNull();
    expect(ecartDePrix({ unitCost: 4100, unitFactor: 1 }, { unitCost: 0, unitFactor: 1 })).toBeNull();
    expect(ecartDePrix({ unitCost: 0, unitFactor: 1 }, sac)).toBeNull();
  });
});

describe('ce que l’écran dit de l’écart (§74)', () => {
  const ancien: DernierPrix = {
    productId: 'prd_1',
    unitCost: 3900,
    unitFactor: 1,
    unitLabel: 'sac',
    orderedAt: '2026-10-12T08:00:00.000Z',
    supplierName: 'Dépôt Central',
  };

  it('dit de combien, en part, et depuis quand', () => {
    const vu = phraseEcartDePrix(ecartDePrix({ unitCost: 4100, unitFactor: 1 }, ancien)!, ancien, 'FCFA');
    expect(vu).toMatch(/augment/);
    // Le taux s'écrit à la française : « +5,1 % », pas « +5.1 % ».
    expect(vu).toContain('+5,1 %');
    expect(vu).toContain('12/10/2026');
    expect(vu).toContain('Dépôt Central');
  });

  it('nomme la baisse comme la hausse', () => {
    const vu = phraseEcartDePrix(ecartDePrix({ unitCost: 3700, unitFactor: 1 }, ancien)!, ancien, 'FCFA');
    expect(vu).toMatch(/baiss/);
    expect(vu).toContain('-5,1 %');
  });

  it('rappelle le prix même quand il n’a pas bougé', () => {
    // Le rappel vaut aussi pour le prix stable : il prouve au fournisseur
    // qu'on suit, et c'est souvent ce qui empêche la hausse suivante.
    const vu = phraseEcartDePrix(ecartDePrix({ unitCost: 3900, unitFactor: 1 }, ancien)!, ancien, 'FCFA');
    expect(vu).toMatch(/même prix/i);
    expect(vu).toContain('Dépôt Central');
  });
});
