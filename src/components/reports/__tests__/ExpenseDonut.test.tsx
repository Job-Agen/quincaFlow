import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExpenseDonut, { CATEGORY_COLORS } from '../ExpenseDonut';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/domain/report';
import type { ExpenseBucket } from '@/types';

/**
 * Répartition des dépenses (§40, F16).
 *
 * Ce que ces tests gardent n'est pas le dessin, c'est la règle qui le rend
 * lisible : le graphique ne doit porter aucune information que la légende ne
 * porte aussi. Trois des six teintes n'atteignent pas 3:1 de contraste sur fond
 * blanc — un anneau sans sa légende chiffrée ne serait pas lisible du tout, et
 * le serait encore moins pour un daltonien.
 */

const BUCKETS: ExpenseBucket[] = [
  { category: 'RENT', amount: 60000, count: 1 },
  { category: 'SALARY', amount: 30000, count: 2 },
  { category: 'TRANSPORT', amount: 10000, count: 4 },
];
const TOTAL = 100000;

describe('anneau de répartition', () => {
  it('nomme et chiffre chaque part dans la légende', () => {
    render(<ExpenseDonut buckets={BUCKETS} total={TOTAL} currency="FCFA" />);

    // Le critère 6 du §40 : aucun poste du graphique ne manque à la légende.
    BUCKETS.forEach((bucket) => {
      expect(screen.getByText(EXPENSE_CATEGORY_LABELS[bucket.category])).toBeDefined();
    });
    expect(screen.getByText('60 %')).toBeDefined();
    expect(screen.getByText('30 %')).toBeDefined();
    expect(screen.getByText('10 %')).toBeDefined();
  });

  it('décrit la répartition en texte pour qui ne voit pas le graphique', () => {
    render(<ExpenseDonut buckets={BUCKETS} total={TOTAL} currency="FCFA" />);
    const description = screen.getByRole('img').getAttribute('aria-label') || '';
    BUCKETS.forEach((bucket) => {
      expect(description).toContain(EXPENSE_CATEGORY_LABELS[bucket.category]);
    });
    expect(description).toMatch(/60 %/);
  });

  it('trace une part par poste, et rien pour un poste à zéro', () => {
    render(
      <ExpenseDonut
        buckets={[...BUCKETS, { category: 'OTHER', amount: 0, count: 0 }]}
        total={TOTAL}
        currency="FCFA"
      />
    );

    // Trois arcs colorés, plus la piste de fond : une part invisible occuperait
    // pourtant une entrée de légende.
    expect(document.querySelectorAll('.donut__ring circle')).toHaveLength(4);
    expect(document.querySelectorAll('.donut__legend li')).toHaveLength(3);
    expect(screen.queryByText(EXPENSE_CATEGORY_LABELS.OTHER)).toBeNull();
  });

  it('attache une teinte au poste, pas à son rang', () => {
    // Un mois sans loyer ne doit pas repeindre les autres parts : la couleur du
    // transport est la même que le loyer soit présent ou non.
    const { unmount } = render(<ExpenseDonut buckets={BUCKETS} total={TOTAL} currency="FCFA" />);
    const avec = [...document.querySelectorAll('.donut__legend .donut__dot')].map(
      (dot) => (dot as HTMLElement).style.background
    );
    unmount();

    render(
      <ExpenseDonut
        buckets={BUCKETS.filter((bucket) => bucket.category !== 'RENT')}
        total={40000}
        currency="FCFA"
      />
    );
    const sans = [...document.querySelectorAll('.donut__legend .donut__dot')].map(
      (dot) => (dot as HTMLElement).style.background
    );

    expect(sans).toEqual(avec.slice(1));
  });

  it('donne une teinte à chacun des six postes', () => {
    // Une teinte manquante rendrait une part invisible sur fond blanc.
    EXPENSE_CATEGORIES.forEach((category) => {
      expect(CATEGORY_COLORS[category]).toMatch(/^#[0-9a-f]{6}$/i);
    });
    expect(new Set(Object.values(CATEGORY_COLORS)).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it('n’affiche rien plutôt qu’un anneau vide quand il n’y a pas de dépense', () => {
    const { container } = render(<ExpenseDonut buckets={[]} total={0} currency="FCFA" />);
    expect(container.firstChild).toBeNull();
  });
});
