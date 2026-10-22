import { describe, expect, it } from 'vitest';
import { isTicket, pageRule, readFormat } from '../ticket';

/**
 * Format d'impression (§54).
 *
 * Ce que ces tests gardent est la seule chose qui ne se voit pas à la
 * relecture : la feuille doit porter la largeur du rouleau. Sans elle, le
 * navigateur met une page A4 à l'échelle sur 58 mm et le total devient
 * illisible — et personne ne s'en aperçoit avant d'avoir imprimé.
 */

describe('règle de page', () => {
  it('donne au rouleau sa largeur réelle, suivie d’une hauteur', () => {
    expect(pageRule(58)).toMatch(/size: 58mm \d+mm/);
    expect(pageRule(80)).toMatch(/size: 80mm \d+mm/);
  });

  it('n’écrit jamais « auto » comme hauteur', () => {
    // `size: 58mm auto` décrirait bien un rouleau, mais ce n'est pas du CSS
    // valide : une longueur et `auto` ne se mélangent pas. Le navigateur jette
    // la règle entière et imprime une A4 écrasée sur 58 mm — et on ne s'en
    // aperçoit qu'une fois le ticket sorti.
    expect(pageRule(58)).not.toContain('auto');
    expect(pageRule(80)).not.toContain('auto');
  });

  it('garde une marge étroite sur un rouleau', () => {
    // Un centimètre de marge mangerait un tiers d'un ticket de 58 mm.
    expect(pageRule(58)).toContain('margin: 2mm');
  });

  it('rend la feuille du bureau à son format', () => {
    expect(pageRule('A4')).toContain('size: A4');
    expect(pageRule('A4')).toContain('margin: 12mm');
  });
});

describe('nature du format', () => {
  it('distingue un rouleau d’une feuille', () => {
    expect(isTicket(58)).toBe(true);
    expect(isTicket(80)).toBe(true);
    expect(isTicket('A4')).toBe(false);
  });
});

describe('lecture d’un format mémorisé', () => {
  it('retrouve une largeur connue', () => {
    expect(readFormat('58')).toBe(58);
    expect(readFormat(80)).toBe(80);
  });

  it('retombe sur la feuille devant n’importe quoi', () => {
    // Le format vient d'un stockage que le navigateur peut vider ou refuser :
    // une valeur inattendue doit imprimer une facture, pas planter l'écran.
    expect(readFormat(null)).toBe('A4');
    expect(readFormat('')).toBe('A4');
    expect(readFormat('thermique')).toBe('A4');
    expect(readFormat(57)).toBe('A4');
  });
});
