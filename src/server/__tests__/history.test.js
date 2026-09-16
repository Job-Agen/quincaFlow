import { describe, expect, it } from 'vitest';
import { periodBounds } from '../history';

/** Le jour local de la borne, pour comparer sans dépendre du fuseau du runner. */
function day(iso) {
  const date = new Date(iso);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

describe('periodBounds — raccourcis (§24)', () => {
  it("borne « aujourd'hui » sur la journée en cours", () => {
    const { from, to } = periodBounds('today');
    const now = new Date();
    expect(day(from)).toEqual([now.getFullYear(), now.getMonth() + 1, now.getDate()]);
    expect(new Date(from).getHours()).toBe(0);
    expect(day(to)).toEqual(day(from));
  });

  it('« 7 jours » couvre bien sept journées, aujourd’hui compris', () => {
    const { from, to } = periodBounds('7d');
    const days = Math.round((new Date(to) - new Date(from)) / 86400000);
    expect(days).toBe(7);
  });

  it('« tout » ne pose aucune borne', () => {
    expect(periodBounds('all')).toEqual({ from: null, to: null });
  });
});

describe('periodBounds — période personnalisée (§24)', () => {
  it('prend les deux dates saisies, bornes de journée comprises', () => {
    const { from, to } = periodBounds('custom', { from: '2026-03-01', to: '2026-03-04' });
    expect(day(from)).toEqual([2026, 3, 1]);
    expect(new Date(from).getHours()).toBe(0);
    expect(day(to)).toEqual([2026, 3, 4]);
    expect(new Date(to).getHours()).toBe(23);
  });

  it('interprète les dates dans le fuseau local, sans décaler la journée', () => {
    // `new Date('2026-03-01')` lirait la chaîne en UTC : à l'ouest de Greenwich
    // la borne retomberait au 28 février.
    expect(day(periodBounds('custom', { from: '2026-03-01' }).from)).toEqual([2026, 3, 1]);
  });

  it('laisse le côté ouvert quand une borne manque', () => {
    expect(periodBounds('custom', { from: '2026-03-01' }).to).toBeNull();
    expect(periodBounds('custom', { to: '2026-03-04' }).from).toBeNull();
    expect(periodBounds('custom', {})).toEqual({ from: null, to: null });
  });

  it('remet d’aplomb des bornes saisies à l’envers', () => {
    const { from, to } = periodBounds('custom', { from: '2026-03-04', to: '2026-03-01' });
    expect(day(from)).toEqual([2026, 3, 1]);
    expect(day(to)).toEqual([2026, 3, 4]);
  });

  it('ignore ce qui n’est pas une date, plutôt que de borner au hasard', () => {
    expect(periodBounds('custom', { from: 'hier', to: '' }).from).toBeNull();
    // Le 31 février n'existe pas : `new Date` le glisserait au 3 mars.
    expect(periodBounds('custom', { from: '2026-02-31' }).from).toBeNull();
    expect(periodBounds('custom', { from: '01/03/2026' }).from).toBeNull();
  });
});
