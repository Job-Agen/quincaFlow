/**
 * Fabrication de fichiers CSV lisibles par Excel (§48).
 *
 * Trois décisions, et chacune vient d'un échec courant quand on ouvre un CSV
 * « standard » sur l'ordinateur d'un comptable à Lomé :
 *
 * — **Le point-virgule, pas la virgule.** Dans un Excel configuré en français,
 *   la virgule est le séparateur décimal : un fichier séparé par des virgules
 *   s'ouvre en une seule colonne, et « 4,50 » devient deux cellules.
 * — **La virgule décimale.** Pour la même raison inverse : « 4.50 » s'affiche
 *   comme du texte, ne s'additionne pas, et fausse toute la colonne.
 * — **Le BOM UTF-8 en tête.** Sans lui, Excel lit le fichier en ANSI et
 *   « Quincaillerie Le Bâtisseur » devient « BÃ¢tisseur ». Le BOM est trois
 *   octets qui épargnent une heure d'explications.
 *
 * Le fichier reste du CSV ordinaire : LibreOffice, Google Sheets et n'importe
 * quel tableur le lisent aussi.
 */

/** Une colonne : son titre, et comment tirer sa valeur d'une ligne. */
export interface CsvColumn<T> {
  readonly title: string;
  readonly value: (row: T) => string | number | null | undefined;
}

/** Le BOM UTF-8, à poser en tête du fichier et nulle part ailleurs. */
export const BOM = '\uFEFF';

/**
 * Échappe une cellule.
 *
 * Les guillemets ne sont posés que lorsqu'ils sont nécessaires — séparateur,
 * guillemet, retour à la ligne — pour que le fichier reste lisible à l'œil nu
 * dans un éditeur de texte.
 */
export function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const texte = typeof value === 'number' ? frenchNumber(value) : String(value);
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/**
 * Un nombre à la française : virgule décimale, sans séparateur de milliers.
 *
 * Pas d'espace pour les milliers : « 1 250 » serait relu comme du texte par le
 * tableur, et la colonne cesserait de s'additionner. La mise en forme est
 * l'affaire de l'écran, pas celle du fichier qu'on va calculer.
 */
export function frenchNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

/** Assemble les lignes en un fichier complet, BOM compris. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const entete = columns.map((colonne) => cell(colonne.title)).join(';');
  const corps = rows.map((ligne) => columns.map((colonne) => cell(colonne.value(ligne))).join(';'));
  // CRLF : c'est ce qu'attendent les tableurs sous Windows, et les autres
  // l'acceptent sans broncher.
  return `${BOM}${[entete, ...corps].join('\r\n')}\r\n`;
}

/**
 * Nom de fichier horodaté : `maquincaillerie_stocks_2026-10-22.csv`.
 *
 * La date est dans le nom parce que ces fichiers finissent par s'accumuler
 * dans un dossier « Téléchargements », et que deux exports du même mois ne
 * doivent pas se recouvrir sans qu'on s'en aperçoive.
 */
export function exportFileName(kind: string, on: Date = new Date(), extension = 'csv'): string {
  const jour = on.toISOString().slice(0, 10);
  return `maquincaillerie_${kind}_${jour}.${extension}`;
}
