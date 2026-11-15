import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CompteARebours from '../CompteARebours';

/**
 * Le chrono d'une charge (§70).
 *
 * Ce que ces tests gardent, c'est ce que l'anneau *montre* : il doit fondre
 * avec le répit, et ne jamais laisser confondre « c'est aujourd'hui » avec
 * « c'est passé ». Le nombre seul ne suffirait pas à les distinguer — c'est
 * tout l'intérêt du dessin.
 */
const charge = (next_due_on: string, last_paid_on: string) => ({
  next_due_on,
  last_paid_on,
  interval_months: 1,
});

/** La longueur d'arc visible, en part du cercle : 1 plein, 0 vide. */
function arc(conteneur: HTMLElement): number {
  const cercle = conteneur.querySelector('.rebours__arc');
  if (!cercle) throw new Error('anneau introuvable');
  const tour = Number(cercle.getAttribute('stroke-dasharray'));
  const decalage = Number(cercle.getAttribute('stroke-dashoffset'));
  return Math.round(((tour - decalage) / tour) * 1000) / 1000;
}

describe('anneau du décompte (§70)', () => {
  it('est plein au lendemain du paiement', () => {
    const { container } = render(
      <CompteARebours charge={charge('2026-12-05', '2026-11-05')} jour="2026-11-05" />
    );
    expect(arc(container)).toBe(1);
    expect(container.querySelector('.rebours__nombre')?.textContent).toBe('30j');
  });

  it('fond à mesure que l’échéance approche', () => {
    const parts = ['2026-11-05', '2026-11-20', '2026-12-01'].map(
      (jour) =>
        arc(render(<CompteARebours charge={charge('2026-12-05', '2026-11-05')} jour={jour} />).container)
    );
    // Strictement décroissant : un anneau qui stagne ne dit rien du temps qui
    // passe, et c'est la seule chose qu'on lui demande.
    expect(parts[1]!).toBeLessThan(parts[0]!);
    expect(parts[2]!).toBeLessThan(parts[1]!);
  });

  it('est vide le jour de l’échéance, et plein quand elle est passée', () => {
    const jourJ = render(
      <CompteARebours charge={charge('2026-12-05', '2026-11-05')} jour="2026-12-05" />
    ).container;
    const apres = render(
      <CompteARebours charge={charge('2026-12-05', '2026-11-05')} jour="2026-12-09" />
    ).container;

    expect(arc(jourJ)).toBe(0);
    expect(arc(apres)).toBe(1);
    // Le dessin seul ne suffirait pas à les séparer d'un anneau neuf : c'est
    // la couleur, portée par l'état, qui dit lequel des deux pleins c'est.
    expect(jourJ.querySelector('.rebours')?.getAttribute('data-etat')).toBe('bientot');
    expect(apres.querySelector('.rebours')?.getAttribute('data-etat')).toBe('en-retard');
  });

  it('compte le retard en jours, sans signe trompeur', () => {
    const { container } = render(
      <CompteARebours charge={charge('2026-12-05', '2026-11-05')} jour="2026-12-09" />
    );
    expect(container.querySelector('.rebours__nombre')?.textContent).toBe('4j');
  });

  it('dit en toutes lettres ce que l’anneau montre', () => {
    // Un anneau n'est rien pour qui ne le voit pas : l'étiquette doit porter
    // la même chose, en mots.
    const { container } = render(
      <CompteARebours charge={charge('2026-12-05', '2026-11-05')} jour="2026-12-09" />
    );
    expect(container.querySelector('.rebours')?.getAttribute('aria-label')).toBe(
      'En retard de 4 jours'
    );
  });
});
