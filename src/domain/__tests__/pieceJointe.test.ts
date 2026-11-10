import { describe, expect, it } from 'vitest';
import {
  MAX_OCTETS,
  entete,
  nomDeFichier,
  poidsLisible,
  refus,
} from '../pieceJointe';

/** Une `data:` URL de `octets` octets, du type demandé. */
const faux = (mime: string, octets: number) =>
  `data:${mime};base64,${'A'.repeat(Math.ceil((octets * 4) / 3))}`;

describe('pièces jointes des commandes (§59)', () => {
  it('lit le type et le poids sans décoder le fichier', () => {
    // « AAAA » : quatre caractères base64, donc trois octets.
    expect(entete('data:application/pdf;base64,AAAA')).toEqual({
      mime: 'application/pdf',
      octets: 3,
    });
    // Le remplissage final ne compte pas pour des octets.
    expect(entete('data:image/png;base64,AAA=')).toEqual({ mime: 'image/png', octets: 2 });
    expect(entete('data:image/png;base64,AA==')).toEqual({ mime: 'image/png', octets: 1 });
  });

  it('refuse ce qui n’est pas une data: URL base64', () => {
    expect(entete('https://exemple.tg/facture.pdf')).toBeNull();
    expect(entete('data:application/pdf,pas-de-base64')).toBeNull();
    expect(entete('data:application/pdf;base64,')).toBeNull();
  });

  it('accepte le PDF, la photo, le Word et l’Excel', () => {
    for (const mime of [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]) {
      expect(refus(faux(mime, 1000))).toBeNull();
    }
  });

  it('refuse ce qui porterait du script dans notre domaine', () => {
    // Servi depuis notre domaine avec son propre type, un SVG exécute son
    // script chez nous. Un fournisseur n'envoie pas sa facture en SVG.
    expect(refus(faux('image/svg+xml', 1000))).toMatch(/Format non accepté/);
    expect(refus(faux('text/html', 1000))).toMatch(/Format non accepté/);
    expect(refus(faux('application/x-msdownload', 1000))).toMatch(/Format non accepté/);
  });

  it('refuse au-delà de la borne, et dit le poids', () => {
    expect(refus(faux('application/pdf', MAX_OCTETS - 10))).toBeNull();
    const trop = refus(faux('application/pdf', MAX_OCTETS + 100_000));
    expect(trop).toMatch(/trop lourd/);
    expect(trop).toMatch(/2,5 Mo/);
  });

  it('écrit un poids que le gérant lit, pas un nombre d’octets', () => {
    expect(poidsLisible(820)).toBe('820 o');
    expect(poidsLisible(240_000)).toBe('240 Ko');
    expect(poidsLisible(1_250_000)).toBe('1,3 Mo');
  });

  it('pose l’extension du type et neutralise ce qui ferait un chemin', () => {
    expect(nomDeFichier('Facture Bâtir Plus', 'application/pdf')).toBe('Facture Bâtir Plus.pdf');
    // Déjà la bonne extension : on ne la double pas.
    expect(nomDeFichier('facture.pdf', 'application/pdf')).toBe('facture.pdf');
    expect(nomDeFichier('../../etc/passwd', 'application/pdf')).toBe('.. .. etc passwd.pdf');
    expect(nomDeFichier('   ', 'image/jpeg')).toBe('document.jpg');
  });
});
