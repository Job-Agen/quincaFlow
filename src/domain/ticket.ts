/**
 * Format d'impression d'une facture (§54).
 *
 * Deux imprimantes coexistent dans une quincaillerie. Celle du bureau sort du
 * A4 : c'est la facture qu'on remet à une entreprise, qu'elle classe et passe
 * en charge. Celle du comptoir est une thermique à rouleau, 58 ou 80 mm de
 * large, qui sort le ticket que le client met dans sa poche.
 *
 * Imprimer une mise en page A4 sur un rouleau de 58 mm ne donne pas un ticket
 * plus petit : le navigateur met la page à l'échelle, et le total devient
 * illisible. Il faut dire à la feuille sa vraie largeur.
 *
 * `@page` ne se laisse pas sélectionner comme une classe : sa taille ne peut
 * venir que d'une règle de haut niveau. Ce module la fabrique ; l'écran
 * l'injecte juste avant d'imprimer et la retire ensuite.
 */

export const TICKET_WIDTHS = [58, 80] as const;
export type TicketWidth = (typeof TICKET_WIDTHS)[number];

/** Le format choisi : une largeur de rouleau, ou la feuille du bureau. */
export type PrintFormat = TicketWidth | 'A4';

export const PRINT_FORMAT_LABELS: Record<string, string> = {
  A4: 'Facture A4',
  '58': 'Ticket 58 mm',
  '80': 'Ticket 80 mm',
};

/**
 * Hauteur déclarée d'un ticket.
 *
 * `size: 58mm auto` serait la description juste d'un rouleau — mais ce n'est
 * pas du CSS valide : `size` prend une longueur, deux, ou `auto`, jamais un
 * mélange des deux. Les navigateurs ignorent la règle entière et impriment du
 * format par défaut, c'est-à-dire une page A4 écrasée sur 58 mm.
 *
 * Il faut donc annoncer une hauteur. 200 mm tient largement un ticket de
 * quincaillerie — une vingtaine de lignes — en une seule page ; l'imprimante
 * thermique, elle, déroule jusqu'à la fin du contenu et coupe là.
 */
const TICKET_HEIGHT_MM = 200;

/**
 * La règle `@page` du format demandé.
 *
 * La marge d'un rouleau est de 2 mm et pas davantage : sur 58 mm de large, un
 * centimètre de marge mangerait un tiers du ticket.
 */
export function pageRule(format: PrintFormat): string {
  if (format === 'A4') return '@page { size: A4; margin: 12mm; }';
  return `@page { size: ${format}mm ${TICKET_HEIGHT_MM}mm; margin: 2mm; }`;
}

/** Vrai si ce format est un rouleau, et demande la mise en page étroite. */
export function isTicket(format: PrintFormat): format is TicketWidth {
  return format !== 'A4';
}

/** Lit un format venu d'un stockage ou d'une URL, sans jamais échouer. */
export function readFormat(value: unknown): PrintFormat {
  const nombre = Number(value);
  return (TICKET_WIDTHS as readonly number[]).includes(nombre)
    ? (nombre as TicketWidth)
    : 'A4';
}
