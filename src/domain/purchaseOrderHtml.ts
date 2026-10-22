import { amount, money, quantity, shortDate } from '../utils/format';
import {
  orderTotal,
  purchaseOrderHeading,
  type OrderDocumentBusiness,
  type OrderMessageHead,
  type OrderMessageLine,
} from './purchase';

/**
 * Le bon de commande en feuille A4 (§43).
 *
 * Le téléphone n'envoyait qu'un message texte. Un fournisseur attend un papier :
 * il l'imprime, le classe, le ressort à la livraison. Ce document existe donc
 * comme HTML autonome — toutes ses règles de style à l'intérieur — pour que
 * `expo-print` en fasse un PDF sur Android sans rien emprunter à l'application.
 *
 * Écrit ici, dans le domaine, et non dans un écran : les montants et le titre
 * viennent des mêmes fonctions que le message et que l'écran web — `orderTotal`
 * et `purchaseOrderHeading` —, pour qu'un fournisseur ne reçoive jamais un
 * total que le gérant ne lit pas chez lui.
 *
 * Le web, lui, imprime son propre écran : il a déjà sa mise en page et ses
 * règles d'impression (§15). C'est le téléphone, qui n'avait rien, que cette
 * feuille sert.
 *
 * `@page size: A4` fixe le format, et les marges sont en millimètres : un PDF
 * se mesure en papier, pas en pixels d'écran.
 */

/** Rien de ce qui vient de la base n'entre dans le HTML sans être échappé. */
function texte(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #111;
  }
  .entete { text-align: center; padding-bottom: 10mm; border-bottom: 0.4mm solid #ccc; }
  .boutique { font-size: 17pt; font-weight: 800; letter-spacing: 0.01em; }
  .meta { font-size: 9.5pt; color: #555; }
  h1 {
    text-align: center;
    font-size: 15pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 9mm 0 6mm;
  }
  .reperes { font-size: 10pt; margin-bottom: 7mm; }
  .reperes div { margin-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #666;
    border-bottom: 0.4mm solid #333;
    padding: 0 2mm 2mm;
  }
  td { padding: 2.5mm 2mm; border-bottom: 0.2mm solid #e2e2e2; vertical-align: top; }
  th:first-child, td:first-child { padding-left: 0; }
  th:last-child, td:last-child { padding-right: 0; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .unite { color: #777; font-size: 9pt; }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-top: 0.6mm solid #111;
    margin-top: 4mm;
    padding-top: 3mm;
    font-size: 13pt;
    font-weight: 800;
  }
  .sans-prix { margin-top: 6mm; font-size: 10pt; color: #444; text-align: center; }
  .observations { margin-top: 6mm; font-size: 10pt; color: #333; }
  .annulee {
    margin-top: 6mm;
    padding: 3mm;
    border: 0.4mm solid #c8201a;
    color: #96201b;
    font-weight: 700;
    text-align: center;
    font-size: 10pt;
  }
  .signatures { display: flex; gap: 14mm; margin-top: 18mm; }
  .signatures div { flex: 1; }
  .signatures span { font-size: 9.5pt; color: #555; }
  .trait { margin-top: 14mm; border-bottom: 0.3mm solid #999; }
  .pied { margin-top: 10mm; font-size: 8.5pt; color: #888; text-align: center; }
`;

export function purchaseOrderHtml(
  order: OrderMessageHead,
  lines: readonly OrderMessageLine[],
  business?: OrderDocumentBusiness | null,
  currency = 'FCFA'
): string {
  const total = orderTotal(
    lines.map((line) => ({ quantity: line.quantity, unitCost: line.unitCost ?? 0 }))
  );
  const chiffre = total > 0;
  const annulee = order.cancelled === true;
  const titre = purchaseOrderHeading(chiffre);

  const colonnes = chiffre
    ? '<th>Désignation</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Total</th>'
    : '<th>Désignation</th><th class="num">Qté</th>';

  const corps = lines
    .map((ligne) => {
      const cout = Number(ligne.unitCost ?? 0);
      const unite = ligne.unitLabel
        ? ` <span class="unite">(${texte(ligne.unitLabel)})</span>`
        : '';
      const debut = `<td>${texte(ligne.productName)}${unite}</td><td class="num">${texte(quantity(ligne.quantity))}</td>`;
      if (!chiffre) return `<tr>${debut}</tr>`;
      const ligneTotal = Number(ligne.quantity) * cout;
      return `<tr>${debut}<td class="num">${texte(amount(cout))}</td><td class="num">${texte(amount(ligneTotal))}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${texte(titre)} ${texte(order.reference || '')}</title>
<style>${STYLE}</style></head>
<body>
  <div class="entete">
    <div class="boutique">${texte((business?.name || '').toUpperCase())}</div>
    ${business?.tagline ? `<div class="meta">${texte(business.tagline)}</div>` : ''}
    ${business?.address ? `<div class="meta">${texte(business.address)}</div>` : ''}
    ${business?.phone ? `<div class="meta">Tél : ${texte(business.phone)}</div>` : ''}
    ${business?.tax_id ? `<div class="meta">IFU / NIF : ${texte(business.tax_id)}</div>` : ''}
  </div>

  <h1>${texte(titre)}</h1>

  <div class="reperes">
    ${order.reference ? `<div>N° : <strong>${texte(order.reference)}</strong></div>` : ''}
    <div>Date : ${texte(shortDate(order.createdAt ?? new Date()))}</div>
    ${order.supplierName ? `<div>Fournisseur : ${texte(order.supplierName)}</div>` : ''}
  </div>

  <table><thead><tr>${colonnes}</tr></thead><tbody>${corps}</tbody></table>

  ${
    chiffre
      ? `<div class="total"><span>TOTAL ESTIMÉ</span><span>${texte(money(total, currency))}</span></div>`
      : `<p class="sans-prix">Merci de nous communiquer vos prix et vos délais pour ces articles.</p>`
  }

  ${order.notes ? `<p class="observations"><strong>Observations :</strong> ${texte(order.notes)}</p>` : ''}

  ${
    annulee
      ? `<p class="annulee">COMMANDE ANNULÉE — ce document ne vaut pas bon de commande.</p>`
      : `<div class="signatures">
           <div><span>Le gérant</span><div class="trait"></div></div>
           <div><span>Le fournisseur</span><div class="trait"></div></div>
         </div>`
  }

  ${business?.name ? `<p class="pied">${texte(business.name)}${business.phone ? ` — Tél : ${texte(business.phone)}` : ''}</p>` : ''}
</body></html>`;
}
