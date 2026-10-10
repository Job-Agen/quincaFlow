import { describe, expect, it } from 'vitest';
import { withRunningBalance } from '../cash';
import type { CashEntry } from '@/types';

/**
 * Solde courant du journal de caisse (§40).
 *
 * Le journal se lit du plus récent au plus ancien ; le solde, lui, se construit
 * depuis le plus ancien. Cette inversion est exactement l'endroit où l'erreur se
 * glisse sans se voir : un solde calculé dans le sens de la lecture décroîtrait
 * vers le passé, et la première ligne porterait le montant de la dernière
 * opération plutôt que le solde de la période.
 */

function entry(id: string, direction: 'IN' | 'OUT', amount: number, day: string): CashEntry {
  return {
    id,
    direction,
    kind: direction === 'IN' ? 'SALE_PAYMENT' : 'EXPENSE',
    occurredAt: `2026-09-${day}T10:00:00.000Z`,
    label: id,
    detail: direction === 'IN' ? 'Espèces' : 'Loyer de boutique',
    amount,
    reference: null,
    saleId: null,
  };
}

/** Trois jours de caisse, du plus récent au plus ancien comme l'écran les reçoit. */
const JOURNAL: CashEntry[] = [
  entry('c', 'OUT', 30000, '12'),
  entry('b', 'IN', 50000, '11'),
  entry('a', 'IN', 20000, '10'),
];

describe('withRunningBalance', () => {
  it('cumule depuis la plus ancienne et rend la liste dans le sens de lecture', () => {
    const soldes = withRunningBalance(JOURNAL).map((line) => [line.id, line.balance]);
    // 20 000 entrés, puis 50 000, puis 30 000 sortis : 20 000 / 70 000 / 40 000.
    expect(soldes).toEqual([
      ['c', 40000],
      ['b', 70000],
      ['a', 20000],
    ]);
  });

  it('fait porter à la première ligne le solde de la période entière', () => {
    const lignes = withRunningBalance(JOURNAL);
    const attendu = JOURNAL.reduce(
      (sum, line) => sum + (line.direction === 'IN' ? line.amount : -line.amount),
      0
    );
    expect(lignes[0]!.balance).toBe(attendu);
  });

  it('descend sous zéro quand les sorties devancent les entrées', () => {
    const decouvert = [entry('b', 'IN', 5000, '11'), entry('a', 'OUT', 40000, '10')];
    const lignes = withRunningBalance(decouvert);
    expect(lignes.map((line) => line.balance)).toEqual([-35000, -40000]);
  });

  it('ne rend rien sur un journal vide, sans inventer de solde', () => {
    expect(withRunningBalance([])).toEqual([]);
  });
});
