import { describe, expect, it } from 'vitest';
import {
  etatCharge,
  phrasePeriode,
  joursAvant,
  phraseEcheance,
  prochaineEcheance,
} from '../charge';

/**
 * Le calendrier des charges qui reviennent (§66).
 *
 * Tout le reste de la fonctionnalité en dépend : une échéance mal calculée
 * rappelle au mauvais moment, et un rappel au mauvais moment ne sert à rien —
 * le gérant cesse de le croire.
 */

describe('l’échéance suivante se compte depuis le paiement', () => {
  it('reporte d’un mois, au même jour', () => {
    // Le chrono, pas le calendrier : payer le 11 reporte au 11, pas au 1er.
    expect(prochaineEcheance('2026-11-11', 1)).toBe('2026-12-11');
    expect(prochaineEcheance('2026-12-11', 1)).toBe('2027-01-11');
  });

  it('compte les trimestres, semestres et années', () => {
    expect(prochaineEcheance('2026-11-11', 3)).toBe('2027-02-11');
    expect(prochaineEcheance('2026-11-11', 6)).toBe('2027-05-11');
    expect(prochaineEcheance('2026-11-11', 12)).toBe('2027-11-11');
  });

  it('accepte n’importe quel nombre de mois (§67)', () => {
    // Une liste de périodes nommées obligeait à ranger un bail payé tous les
    // deux mois dans une case qui n'existait pas.
    expect(prochaineEcheance('2026-11-11', 2)).toBe('2027-01-11');
    expect(prochaineEcheance('2026-11-11', 4)).toBe('2027-03-11');
    expect(prochaineEcheance('2026-11-11', 18)).toBe('2028-05-11');
  });

  it('se défend d’un nombre de mois absurde', () => {
    // Zéro reporterait au même jour, et le rappel sonnerait sans fin.
    expect(prochaineEcheance('2026-11-11', 0)).toBe('2026-12-11');
    expect(prochaineEcheance('2026-11-11', 1.4)).toBe('2026-12-11');
  });

  it('nomme la périodicité pour l’écran', () => {
    expect(phrasePeriode(1)).toBe('Chaque mois');
    expect(phrasePeriode(3)).toBe('Tous les 3 mois');
    expect(phrasePeriode(12)).toBe('Chaque année');
  });

  it('ne déborde pas sur le mois suivant quand le jour n’existe pas', () => {
    // Un mois après le 31 janvier n'existe pas. L'arithmétique naïve de
    // JavaScript donnerait le 3 mars ; le loyer se paierait alors le 3, puis
    // le 3, et la date glisserait d'année en année.
    expect(prochaineEcheance('2026-01-31', 1)).toBe('2026-02-28');
    expect(prochaineEcheance('2028-01-31', 1)).toBe('2028-02-29');
    expect(prochaineEcheance('2026-03-31', 1)).toBe('2026-04-30');
    expect(prochaineEcheance('2026-08-31', 3)).toBe('2026-11-30');
  });

  it('garde le jour voulu dès que le mois le permet', () => {
    // Ramenée au 28 en février, l'échéance ne doit pas y rester coincée : on
    // compte toujours depuis le paiement, et le gérant paiera le 28.
    expect(prochaineEcheance('2026-02-28', 1)).toBe('2026-03-28');
  });
});

describe('ce que le gérant lit', () => {
  const aujourdhui = '2026-11-11';

  it('compte les jours, dans les deux sens', () => {
    expect(joursAvant('2026-11-11', aujourdhui)).toBe(0);
    expect(joursAvant('2026-11-14', aujourdhui)).toBe(3);
    expect(joursAvant('2026-11-08', aujourdhui)).toBe(-3);
    // Et par-dessus un changement d'heure, qui décalerait un calcul en heures.
    expect(joursAvant('2026-12-11', aujourdhui)).toBe(30);
  });

  it('dit le retard avant tout le reste', () => {
    expect(phraseEcheance('2026-11-08', aujourdhui)).toBe('En retard de 3 jours');
    expect(phraseEcheance('2026-11-10', aujourdhui)).toBe('En retard depuis hier');
    expect(phraseEcheance('2026-11-11', aujourdhui)).toBe('À payer aujourd’hui');
    expect(phraseEcheance('2026-11-12', aujourdhui)).toBe('À payer demain');
    expect(phraseEcheance('2026-11-16', aujourdhui)).toBe('Dans 5 jours');
  });

  it('classe en retard, bientôt, plus tard', () => {
    expect(etatCharge('2026-11-10', aujourdhui)).toBe('en-retard');
    expect(etatCharge('2026-11-11', aujourdhui)).toBe('bientot');
    // Une semaine : de quoi réunir la somme.
    expect(etatCharge('2026-11-18', aujourdhui)).toBe('bientot');
    expect(etatCharge('2026-11-19', aujourdhui)).toBe('plus-tard');
  });
});
