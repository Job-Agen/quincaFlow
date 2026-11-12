import { describe, expect, it } from 'vitest';
import { repartirTransport } from '../purchase';

/**
 * Répartition du transport entre les marchandises d'une livraison (§69).
 *
 * Le gérant paie le camion d'un bloc ; chaque marchandise doit en porter sa
 * part, sans qu'un franc se perde en route.
 */
describe('repartirTransport (§69)', () => {
  const lignes = [
    { itemId: 'a', quantity: 10, unitCost: 3000 }, // 30 000
    { itemId: 'b', quantity: 10, unitCost: 1000 }, // 10 000
  ];

  it('répartit au prorata de la valeur des lignes', () => {
    const parts = repartirTransport(lignes, 8000);
    expect(parts.get('a')).toBe(6000);
    expect(parts.get('b')).toBe(2000);
  });

  it('rend exactement ce qui a été payé, arrondis compris', () => {
    // 1 000 sur trois lignes égales : 333,33 × 3 = 999,99. Le franc manquant
    // ne doit pas disparaître.
    const trois = ['a', 'b', 'c'].map((itemId) => ({ itemId, quantity: 1, unitCost: 100 }));
    const parts = repartirTransport(trois, 1000);
    const somme = [...parts.values()].reduce((a, b) => a + b, 0);
    expect(Math.round(somme * 100) / 100).toBe(1000);
  });

  it('rattrape l’arrondi sur la plus grosse ligne, pas sur la plus petite', () => {
    // Le franc d'écart doit tomber là où il se voit le moins. Posé sur une
    // ligne minuscule, il en déformerait le coût unitaire de plusieurs pour
    // cent ; posé sur la plus grosse, il s'y perd.
    const parts = repartirTransport(
      [
        { itemId: 'a', quantity: 1, unitCost: 7000 },
        { itemId: 'b', quantity: 1, unitCost: 7000 },
        { itemId: 'c', quantity: 1, unitCost: 1 },
      ],
      100
    );
    expect(parts.get('a')).toBe(49.99);
    expect(parts.get('b')).toBe(50);
    expect(parts.get('c')).toBe(0.01);
  });

  it('ne répartit rien quand il n’y a pas de transport', () => {
    for (const rien of [0, null, undefined, '', -500]) {
      const parts = repartirTransport(lignes, rien);
      expect([...parts.values()]).toEqual([0, 0]);
    }
  });

  it('se rabat sur les quantités quand aucune ligne n’est chiffrée', () => {
    // Un bon non chiffré (demande de prix) ne doit pas faire évaporer le
    // transport : à défaut de valeur, le volume sert de clé.
    const parts = repartirTransport(
      [
        { itemId: 'a', quantity: 30, unitCost: 0 },
        { itemId: 'b', quantity: 10, unitCost: 0 },
      ],
      4000
    );
    expect(parts.get('a')).toBe(3000);
    expect(parts.get('b')).toBe(1000);
  });

  it('partage à parts égales quand ni valeur ni quantité ne départagent', () => {
    const parts = repartirTransport(
      [
        { itemId: 'a', quantity: 0, unitCost: 0 },
        { itemId: 'b', quantity: 0, unitCost: 0 },
      ],
      1000
    );
    expect(parts.get('a')).toBe(500);
    expect(parts.get('b')).toBe(500);
  });

  it('rend une part par ligne, même sans transport à répartir', () => {
    // L'appelant lit `parts.get(itemId)` pour chaque ligne : une clé absente
    // le forcerait à traiter « pas de part » différemment de « part nulle ».
    expect([...repartirTransport(lignes, 0).keys()]).toEqual(['a', 'b']);
  });
});
