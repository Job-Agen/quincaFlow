import { invoiceFileName } from '../domain/invoice';

/**
 * Rendu PDF d'une facture (§15).
 *
 * jsPDF est chargé à la demande, jamais au chargement de l'écran : le moteur
 * pèse plusieurs centaines de kilo-octets, et une quincaillerie sur une
 * connexion faible (§33) ne doit pas les payer pour consulter une vente qu'elle
 * n'exportera pas.
 *
 * Le document est produit dans le navigateur plutôt que sur le serveur : il n'y
 * a rien à transmettre, donc rien à attendre, et le PDF reste disponible même
 * quand le réseau se dégrade après le chargement de la page.
 */

const PAGE = { width: 210, height: 297 }; // A4 portrait, en millimètres
const MARGIN = 16;
const RIGHT = PAGE.width - MARGIN;

// Colonnes du tableau. `designation` s'étire, les trois autres sont alignées à
// droite sur leur bord : des montants alignés à gauche ne se comparent pas.
const COL = { designation: MARGIN, quantity: 116, unitPrice: 146, lineTotal: RIGHT };
const DESIGNATION_WIDTH = COL.quantity - MARGIN - 6;

/**
 * Ramène les espaces insécables à une espace ordinaire.
 *
 * `toLocaleString('fr-FR')` sépare les milliers par une espace fine insécable
 * (U+202F). Ce caractère est absent de l'encodage WinAnsi des polices standard
 * du PDF : jsPDF bascule alors toute la chaîne en UTF-16, où la police n'a aucun
 * glyphe pour lui — « 19 250 » s'imprimerait amputé. Le PDF positionnant chaque
 * ligne lui-même, l'insécabilité n'y sert à rien : une espace ordinaire suffit.
 *
 * Les autres caractères français (accents, tiret cadratin, apostrophe courbe,
 * guillemets, euro) sont, eux, bien présents en WinAnsi et passent intacts.
 */
function clean(value) {
  return String(value).replace(/[\u202f\u00a0]/g, ' ');
}

/** Construit le PDF et le renvoie en Blob, prêt à télécharger ou à partager. */
export async function renderInvoicePdf(document) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const text = (value, x, options) => doc.text(clean(value), x, y, options);
  const right = (value, x) => text(value, x, { align: 'right' });
  const wrap = (value, width) => doc.splitTextToSize(clean(value), width);

  // ── Vendeur ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(16);
  text(document.seller.name, MARGIN);
  y += 6;

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  document.seller.lines.forEach((line) => {
    text(line, MARGIN);
    y += 4.5;
  });
  doc.setTextColor(0);

  // ── Titre ────────────────────────────────────────────────────────────────
  y += 6;
  doc.setFont('helvetica', 'bold').setFontSize(13);
  text('FACTURE', MARGIN);

  // Une facture annulée doit le dire au premier coup d'œil, à côté du titre :
  // c'est la mention que le lecteur cherche avant les montants.
  if (document.cancelled) {
    doc.setTextColor(200, 30, 30);
    right('ANNULÉE', RIGHT);
    doc.setTextColor(0);
  }
  y += 8;

  // ── Références ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  document.meta.forEach((line) => {
    text(line, MARGIN);
    y += 4.8;
  });

  // ── Tableau ──────────────────────────────────────────────────────────────
  y += 4;
  doc.setFont('helvetica', 'bold').setFontSize(9.5);
  text('Désignation', COL.designation);
  right('Qté', COL.quantity);
  right('Prix', COL.unitPrice);
  right('Total', COL.lineTotal);
  y += 2.5;
  doc.setDrawColor(200).line(MARGIN, y, RIGHT, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  document.rows.forEach((row) => {
    // Un nom long est replié plutôt que tronqué : le client doit pouvoir
    // reconnaître ce qu'il a acheté.
    const wrapped = wrap(row.designation, DESIGNATION_WIDTH);
    y = pageBreak(doc, y, wrapped.length * 5 + 2);

    const top = y;
    wrapped.forEach((line, index) => {
      doc.text(line, COL.designation, top + index * 5);
    });
    // Quantité, prix et total s'alignent sur la première ligne du libellé.
    doc.text(clean(row.quantity), COL.quantity, top, { align: 'right' });
    doc.text(clean(row.unitPrice), COL.unitPrice, top, { align: 'right' });
    doc.text(clean(row.lineTotal), COL.lineTotal, top, { align: 'right' });
    y = top + wrapped.length * 5 + 1;
  });

  // ── Totaux ───────────────────────────────────────────────────────────────
  y = pageBreak(doc, y, 34);
  y += 1;
  doc.setDrawColor(200).line(MARGIN, y, RIGHT, y);
  y += 6;

  if (document.discount) {
    doc.setFontSize(9.5);
    text('Remise', MARGIN);
    right(`- ${document.discount}`, RIGHT);
    y += 6;
  }

  doc.setFont('helvetica', 'bold').setFontSize(13);
  text('TOTAL', MARGIN);
  right(document.total, RIGHT);
  y += 8;

  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(90);
  text(document.paymentMethod, MARGIN);
  doc.setTextColor(...alertColour(document.cancelled));
  right(document.paymentStatus, RIGHT);
  y += 10;

  // ── Pied ─────────────────────────────────────────────────────────────────
  y = pageBreak(doc, y, 14);
  doc.setFontSize(9);
  doc.setTextColor(...alertColour(document.cancelled));
  wrap(document.footer, RIGHT - MARGIN).forEach((line) => {
    text(line, MARGIN);
    y += 4.5;
  });

  return doc.output('blob');
}

/** Rouge pour ce qui alerte, gris pour le reste. */
function alertColour(cancelled) {
  return cancelled ? [200, 30, 30] : [90, 90, 90];
}

/** Ouvre une page si le bloc à écrire ne tient plus, et renvoie l'ordonnée à utiliser. */
function pageBreak(doc, y, needed) {
  if (y + needed <= PAGE.height - MARGIN) return y;
  doc.addPage();
  return MARGIN;
}

/**
 * Propose le PDF au téléchargement. Le lien est synthétique et révoqué aussitôt :
 * un object URL laissé en place retient le document en mémoire jusqu'au
 * rechargement de l'onglet.
 */
export async function downloadInvoicePdf(invoice) {
  const blob = await renderInvoicePdf(invoice);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = invoiceFileName(invoice);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Le PDF sous forme de fichier, pour le partage natif. */
export async function invoicePdfFile(invoice) {
  const blob = await renderInvoicePdf(invoice);
  return new File([blob], invoiceFileName(invoice), { type: 'application/pdf' });
}
