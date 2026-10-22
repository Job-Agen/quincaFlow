import { describe, expect, it } from 'vitest';
import { BOM, cell, exportFileName, frenchNumber, toCsv } from '../csv';

describe('cellule CSV', () => {
  it('laisse un texte ordinaire tel quel', () => {
    expect(cell('Ciment')).toBe('Ciment');
  });

  it('protège une cellule qui contient le séparateur', () => {
    // Sans guillemets, « Lomé; Togo » deviendrait deux colonnes.
    expect(cell('Lomé; Togo')).toBe('"Lomé; Togo"');
  });

  it('double les guillemets intérieurs', () => {
    expect(cell('Tôle dite "bac alu"')).toBe('"Tôle dite ""bac alu"""');
  });

  it('protège un retour à la ligne', () => {
    expect(cell('Avenue\nde la Paix')).toBe('"Avenue\nde la Paix"');
  });

  it('rend une cellule vide pour ce qui n’existe pas', () => {
    expect(cell(null)).toBe('');
    expect(cell(undefined)).toBe('');
  });
});

describe('nombre à la française', () => {
  it('écrit la décimale avec une virgule', () => {
    expect(frenchNumber(318.75)).toBe('318,75');
  });

  it('n’insère aucun séparateur de milliers', () => {
    // « 1 250 » serait relu comme du texte, et la colonne cesserait de
    // s’additionner dans le tableur.
    expect(frenchNumber(1250)).toBe('1250');
  });

  it('écrit un entier sans décimale inutile', () => {
    expect(frenchNumber(4800)).toBe('4800');
  });

  it('ne prétend rien d’un nombre absurde', () => {
    expect(frenchNumber(Number.NaN)).toBe('');
    expect(frenchNumber(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('passe par la virgule depuis une cellule aussi', () => {
    expect(cell(318.75)).toBe('318,75');
  });
});

describe('fichier complet', () => {
  const lignes = [
    { nom: 'Ciment CIMTOGO 50 kg', prix: 4800, stock: 228 },
    { nom: 'Tôle; bac alu', prix: 9900.5, stock: 3 },
  ];
  const colonnes = [
    { title: 'Produit', value: (l: (typeof lignes)[number]) => l.nom },
    { title: 'Prix de vente', value: (l: (typeof lignes)[number]) => l.prix },
    { title: 'Stock', value: (l: (typeof lignes)[number]) => l.stock },
  ];

  it('commence par le BOM, sans quoi Excel abîme les accents', () => {
    // Le caractère est écrit en toutes lettres : se comparer à la constante
    // exportée laisserait passer un BOM devenu vide.
    expect(toCsv(lignes, colonnes).charCodeAt(0)).toBe(0xfeff);
    expect(BOM).toBe('\uFEFF');
  });

  it('sépare les colonnes par un point-virgule', () => {
    const [entete] = toCsv(lignes, colonnes).slice(BOM.length).split('\r\n');
    expect(entete).toBe('Produit;Prix de vente;Stock');
  });

  it('écrit une ligne par enregistrement, terminée en CRLF', () => {
    const fichier = toCsv(lignes, colonnes);
    expect(fichier.endsWith('\r\n')).toBe(true);
    expect(fichier.trimEnd().split('\r\n')).toHaveLength(3);
  });

  it('met en forme et protège les valeurs', () => {
    const lignesFichier = toCsv(lignes, colonnes).slice(BOM.length).trimEnd().split('\r\n');
    expect(lignesFichier[1]).toBe('Ciment CIMTOGO 50 kg;4800;228');
    expect(lignesFichier[2]).toBe('"Tôle; bac alu";9900,5;3');
  });

  it('rend un fichier avec son seul en-tête quand il n’y a rien à exporter', () => {
    expect(toCsv([], colonnes).slice(BOM.length)).toBe('Produit;Prix de vente;Stock\r\n');
  });
});

describe('nom de fichier', () => {
  it('porte la date du jour', () => {
    expect(exportFileName('stocks', new Date('2026-10-22T09:00:00Z'))).toBe(
      'maquincaillerie_stocks_2026-10-22.csv'
    );
  });

  it('accepte une autre extension pour la sauvegarde', () => {
    expect(exportFileName('sauvegarde', new Date('2026-10-22T09:00:00Z'), 'json')).toBe(
      'maquincaillerie_sauvegarde_2026-10-22.json'
    );
  });
});
