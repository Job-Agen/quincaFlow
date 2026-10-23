import { describe, expect, it } from 'vitest';
import { entierEnLettres, montantEnLettres } from '../lettres';

/**
 * Le montant en toutes lettres (§56).
 *
 * C'est la mention qui rend une facture opposable : un chiffre se retouche au
 * stylo, une somme en lettres non. Ces tests gardent les pièges du français —
 * ceux qu'on ne voit qu'une fois la facture imprimée et contestée.
 */

describe('les pièges du français', () => {
  it('écrit les dizaines simples', () => {
    expect(entierEnLettres(20)).toBe('vingt');
    expect(entierEnLettres(30)).toBe('trente');
    expect(entierEnLettres(60)).toBe('soixante');
  });

  it('met « et » devant un, mais pas après quatre-vingt', () => {
    expect(entierEnLettres(21)).toBe('vingt et un');
    expect(entierEnLettres(31)).toBe('trente et un');
    expect(entierEnLettres(81)).toBe('quatre-vingt-un');
  });

  it('compte soixante-dix et quatre-vingt-dix par dix', () => {
    expect(entierEnLettres(70)).toBe('soixante-dix');
    expect(entierEnLettres(71)).toBe('soixante et onze');
    expect(entierEnLettres(77)).toBe('soixante-dix-sept');
    expect(entierEnLettres(90)).toBe('quatre-vingt-dix');
    expect(entierEnLettres(91)).toBe('quatre-vingt-onze');
    expect(entierEnLettres(99)).toBe('quatre-vingt-dix-neuf');
  });

  it('accorde quatre-vingts seulement quand rien ne le suit', () => {
    expect(entierEnLettres(80)).toBe('quatre-vingts');
    expect(entierEnLettres(82)).toBe('quatre-vingt-deux');
    expect(entierEnLettres(180)).toBe('cent quatre-vingts');
  });

  it('accorde cent multiplié et non suivi', () => {
    expect(entierEnLettres(100)).toBe('cent');
    expect(entierEnLettres(200)).toBe('deux cents');
    expect(entierEnLettres(203)).toBe('deux cent trois');
    expect(entierEnLettres(101)).toBe('cent un');
  });

  it('laisse mille invariable, accorde million et milliard', () => {
    expect(entierEnLettres(1000)).toBe('mille');
    expect(entierEnLettres(2000)).toBe('deux mille');
    expect(entierEnLettres(1000000)).toBe('un million');
    expect(entierEnLettres(2000000)).toBe('deux millions');
    expect(entierEnLettres(2000000000)).toBe('deux milliards');
  });

  it('saute les tranches vides', () => {
    // « Un million cinq cents » et non « un million zéro mille cinq cents ».
    expect(entierEnLettres(1000500)).toBe('un million cinq cents');
  });
});

describe('un montant de facture', () => {
  it('écrit une somme ordinaire de quincaillerie', () => {
    expect(montantEnLettres(19250, 'FCFA')).toBe('dix-neuf mille deux cent cinquante FCFA');
    expect(montantEnLettres(675600, 'FCFA')).toBe(
      'six cent soixante-quinze mille six cents FCFA'
    );
  });

  it('reprend la devise de la boutique plutôt qu’une devise en dur', () => {
    // Une boutique qui compte en cédis ne doit pas voir « FCFA » (§6).
    expect(montantEnLettres(500, 'GHS')).toBe('cinq cents GHS');
  });

  it('dit les centimes qui traînent plutôt que de les taire', () => {
    // Une somme en lettres qui ne correspond pas au chiffre ne vaut rien.
    expect(montantEnLettres(1312.5, 'FCFA')).toBe(
      'mille trois cent douze FCFA et cinquante centimes'
    );
  });

  it('écrit zéro pour une facture à zéro', () => {
    expect(montantEnLettres(0, 'FCFA')).toBe('zéro FCFA');
  });
});
