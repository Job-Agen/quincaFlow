import { describe, expect, it } from 'vitest';
import {
  alerteEcheance,
  decompte,
  echeancePrecedente,
  prochaineEcheance,
} from '../charge';

/**
 * Le chrono d'une charge (§70).
 *
 * Ce que ces tests gardent, c'est le sens de l'anneau : il doit être plein
 * quand le répit est entier, vide le jour de l'échéance, et ne jamais sortir
 * de ses bornes — ni avant le paiement, ni longtemps après.
 */
describe('décompte d’une charge (§70)', () => {
  const charge = {
    next_due_on: '2026-12-05',
    last_paid_on: '2026-11-05',
    interval_months: 1,
  };

  it('part du nombre de jours de la période, pas d’un mois théorique', () => {
    // Du 5 novembre au 5 décembre il y a 30 jours, pas 31 ni « un mois ».
    const d = decompte(charge, '2026-11-05');
    expect(d.total).toBe(30);
    expect(d.jours).toBe(30);
    expect(d.ecoules).toBe(0);
    expect(d.part).toBe(0);
  });

  it('diminue d’un jour par jour', () => {
    expect(decompte(charge, '2026-11-06').jours).toBe(29);
    expect(decompte(charge, '2026-11-20').jours).toBe(15);
    expect(decompte(charge, '2026-12-04').jours).toBe(1);
  });

  it('tombe à zéro le jour de l’échéance, et l’anneau est vide', () => {
    const d = decompte(charge, '2026-12-05');
    expect(d.jours).toBe(0);
    expect(d.part).toBe(1);
    expect(d.etat).toBe('bientot');
  });

  it('compte le retard en négatif sans déborder l’anneau', () => {
    const d = decompte(charge, '2026-12-20');
    expect(d.jours).toBe(-15);
    // La part écoulée reste bornée à 1 : un anneau rempli à 150 % se
    // dessinerait à l'envers.
    expect(d.part).toBe(1);
    expect(d.ecoules).toBe(d.total);
    expect(d.etat).toBe('en-retard');
  });

  it('ne recule pas avant le paiement', () => {
    // Une date antérieure au paiement — horloge mal réglée, saisie rétroactive
    // — donnerait une part négative, donc un arc plus long que le cercle.
    const d = decompte(charge, '2026-10-01');
    expect(d.part).toBe(0);
    expect(d.ecoules).toBe(0);
  });

  it('compte depuis le paiement réel, pas depuis une période reconstituée', () => {
    // Passer une charge de « chaque mois » à « tous les 2 mois » ne déplace
    // pas l'échéance en cours (le serveur la laisse telle quelle) : le chrono
    // doit alors partir du paiement, et non remonter deux mois en arrière,
    // ce qui lui donnerait un répit de 61 jours qui n'a jamais existé.
    const rallongee = {
      next_due_on: '2026-12-05',
      last_paid_on: '2026-11-05',
      interval_months: 2,
    };
    const d = decompte(rallongee, '2026-11-20');
    expect(d.total).toBe(30);
    expect(d.ecoules).toBe(15);
    expect(d.part).toBe(0.5);
  });

  it('se passe de la date du dernier paiement quand elle manque', () => {
    const sansPaiement = { next_due_on: '2026-12-05', last_paid_on: null, interval_months: 1 };
    const d = decompte(sansPaiement, '2026-11-20');
    expect(d.total).toBe(30);
    expect(d.jours).toBe(15);
  });

  it('ne divise jamais par zéro', () => {
    const immediat = { next_due_on: '2026-11-05', last_paid_on: '2026-11-05', interval_months: 1 };
    const d = decompte(immediat, '2026-11-05');
    expect(Number.isFinite(d.part)).toBe(true);
    expect(d.total).toBeGreaterThan(0);
  });

  it('suit la période réelle, pas une durée moyenne', () => {
    // Février est court : le chrono doit partir de 28, pas de 30.
    const court = { next_due_on: '2026-03-01', last_paid_on: '2026-02-01', interval_months: 1 };
    expect(decompte(court, '2026-02-01').total).toBe(28);
    const long = { next_due_on: '2026-08-01', last_paid_on: '2026-07-01', interval_months: 1 };
    expect(decompte(long, '2026-07-01').total).toBe(31);
  });
});

describe('échéance précédente (§70)', () => {
  it('revient sur ses pas', () => {
    expect(echeancePrecedente(prochaineEcheance('2026-11-05', 1), 1)).toBe('2026-11-05');
    expect(echeancePrecedente(prochaineEcheance('2026-05-20', 3), 3)).toBe('2026-05-20');
  });

  it('ne déborde pas sur le mois d’avant', () => {
    // Un mois avant le 31 mars n'existe pas : c'est le 28 février, pas le
    // 3 mars de l'arithmétique naïve.
    expect(echeancePrecedente('2026-03-31', 1)).toBe('2026-02-28');
  });
});

describe('le mot à côté du chrono (§70)', () => {
  it('ne dit rien quand le nombre suffit', () => {
    expect(alerteEcheance('2026-12-05', '2026-11-20')).toBeNull();
    expect(alerteEcheance('2026-12-05', '2026-12-04')).toBeNull();
  });

  it('nomme le jour même et le retard', () => {
    expect(alerteEcheance('2026-12-05', '2026-12-05')).toBe('Aujourd’hui');
    expect(alerteEcheance('2026-12-05', '2026-12-06')).toBe('En retard');
  });
});
