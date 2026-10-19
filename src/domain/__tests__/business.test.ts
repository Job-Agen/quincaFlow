import { describe, expect, it } from 'vitest';
import { confirmsBusinessName, plainName } from '../business';

const BOUTIQUE = 'Quincaillerie Le Bâtisseur';

describe('confirmation du nom de la boutique', () => {
  it('accepte le nom exact', () => {
    expect(confirmsBusinessName(BOUTIQUE, BOUTIQUE)).toBe(true);
  });

  it('pardonne les accents, que le clavier d’un téléphone donne mal', () => {
    expect(confirmsBusinessName('Quincaillerie Le Batisseur', BOUTIQUE)).toBe(true);
  });

  it('pardonne la casse et les espaces en trop', () => {
    expect(confirmsBusinessName('  quincaillerie   le bâtisseur ', BOUTIQUE)).toBe(true);
  });

  it('refuse un nom incomplet', () => {
    expect(confirmsBusinessName('Quincaillerie', BOUTIQUE)).toBe(false);
    expect(confirmsBusinessName('Le Bâtisseur', BOUTIQUE)).toBe(false);
  });

  it('refuse un autre nom, même proche', () => {
    expect(confirmsBusinessName('Quincaillerie Le Bâtisseurs', BOUTIQUE)).toBe(false);
    expect(confirmsBusinessName('Quincaillerie Les Bâtisseur', BOUTIQUE)).toBe(false);
  });

  it('ne confirme jamais rien à partir du vide', () => {
    // Sans cette garde, un champ laissé blanc effacerait une boutique sans nom.
    expect(confirmsBusinessName('', '')).toBe(false);
    expect(confirmsBusinessName('   ', BOUTIQUE)).toBe(false);
    expect(confirmsBusinessName(null, BOUTIQUE)).toBe(false);
    expect(confirmsBusinessName(BOUTIQUE, null)).toBe(false);
  });

  it('dépouille le nom sans le vider', () => {
    expect(plainName('  Dépôt   Central  Lomé ')).toBe('depot central lome');
  });
});
