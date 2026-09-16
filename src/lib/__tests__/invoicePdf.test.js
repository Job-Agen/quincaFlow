import { describe, expect, it } from 'vitest';
import { buildInvoiceDocument } from '../../domain/invoice';
import { renderInvoicePdf } from '../invoicePdf';

/**
 * Ces tests produisent un vrai PDF et relisent ses octets.
 *
 * Ils gardent une régression précise : `toLocaleString('fr-FR')` sépare les
 * milliers par U+202F et `money()` pose U+00A0 avant la devise. Ces deux
 * caractères sont absents de l'encodage WinAnsi des polices standard du PDF ;
 * s'ils atteignent jsPDF, celui-ci bascule toute la chaîne en UTF-16 et les
 * montants s'impriment amputés. La facture serait fausse sans qu'aucun test du
 * domaine ne s'en aperçoive.
 */

const business = { name: 'Quincaillerie ABC', address: 'Rue 12, Lomé', phone: '90 00 00 00' };

const sale = {
  status: 'COMPLETED',
  reference: 'VE-0001',
  invoice_reference: 'FA-2026-00124',
  created_at: '2026-03-04T10:47:00.000Z',
  customer_name: null,
  discount: 250,
  total: 48750,
  payment_method: 'CASH',
  payment_status: 'PAID',
  items: [
    {
      id: 'i1',
      product_name: 'Serrure encastrable 3 points laiton vieilli — modèle renforcé',
      unit_label: 'pièce',
      unit_factor: 1,
      quantity: 3,
      unit_price: 5000,
      line_total: 15000,
    },
    {
      id: 'i2',
      product_name: 'Vitre 60 cm',
      unit_label: 'carton',
      unit_factor: 40,
      quantity: 2,
      unit_price: 17000,
      line_total: 34000,
    },
  ],
};

async function render(overrides = {}) {
  const document = buildInvoiceDocument({
    sale: { ...sale, ...overrides },
    business,
    currency: 'FCFA',
  });
  const blob = await renderInvoicePdf(document);
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { bytes, raw: bytes.toString('latin1') };
}

describe('renderInvoicePdf', () => {
  it('produit un PDF valide', async () => {
    const { bytes, raw } = await render();
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("n'encode aucun texte en UTF-16, où la police standard n'a pas de glyphe", async () => {
    const { raw } = await render();
    // Un texte UTF-16 commence par un octet nul juste après la parenthèse.
    expect(/\(\x00/.test(raw)).toBe(false);
  });

  it('écrit les montants avec des espaces ordinaires, lisibles par la police', async () => {
    const { raw } = await render();
    expect(raw).toContain('48 750 FCFA');
    expect(raw).not.toContain(' ');
    expect(raw).not.toContain(' ');
  });

  it('conserve accents et tiret cadratin dans les libellés', async () => {
    const { raw } = await render();
    // WinAnsi : é = 0xE9, tiret cadratin = 0x97.
    expect(raw).toContain('é'); // « Désignation », « pièce », « Lomé »
    expect(raw).toContain('');
  });

  it('marque une facture annulée pour que nul ne la prenne pour un justificatif', async () => {
    const { raw } = await render({
      status: 'CANCELLED',
      note: 'Erreur de saisie',
      updated_at: '2026-03-04T11:02:00.000Z',
    });
    expect(raw).toContain('ANNUL');
    expect(raw).toContain('ne vaut pas justificatif');
  });
});
