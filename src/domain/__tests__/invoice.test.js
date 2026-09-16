import { describe, expect, it } from 'vitest';
import { buildInvoiceDocument, invoiceFileName } from '../invoice';

const business = {
  name: 'Quincaillerie ABC',
  address: 'Rue 12, Lomé',
  phone: '90 00 00 00',
};

const sale = {
  status: 'COMPLETED',
  reference: 'VE-0001',
  invoice_reference: 'FA-2026-00124',
  created_at: '2026-03-04T10:47:00.000Z',
  customer_name: null,
  discount: 0,
  total: 19250,
  payment_method: 'CASH',
  payment_status: 'PAID',
  items: [
    {
      id: 'i1',
      product_name: 'Serrure',
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
      quantity: 1,
      unit_price: 17000,
      line_total: 17000,
    },
  ],
};

describe('buildInvoiceDocument', () => {
  it("reprend l'identité de la boutique et écarte les champs vides", () => {
    const doc = buildInvoiceDocument({ sale, business: { name: 'ABC', address: '' } });
    expect(doc.seller.name).toBe('ABC');
    expect(doc.seller.lines).toEqual([]);
  });

  it('rappelle le conditionnement seulement quand il dépasse une unité de base', () => {
    const doc = buildInvoiceDocument({ sale, business });
    expect(doc.rows[0].designation).toBe('Serrure');
    expect(doc.rows[1].designation).toBe('Vitre 60 cm (carton)');
  });

  it('retombe sur « Client comptoir » quand la vente est anonyme (§23)', () => {
    const doc = buildInvoiceDocument({ sale, business });
    expect(doc.meta).toContain('Client : Client comptoir');
  });

  it('formate le total avec la devise et masque une remise nulle', () => {
    const doc = buildInvoiceDocument({ sale, business, currency: 'FCFA' });
    // Deux espaces insécables distinctes : U+202F entre les milliers (format
    // fr-FR) et U+00A0 avant la devise (money()). Le rendu PDF doit les ramener
    // à une espace ordinaire — voir `clean()` dans lib/invoicePdf.js.
    expect(doc.total).toBe('19\u202f250\u00a0FCFA');
    expect(doc.discount).toBeNull();
  });

  it('expose la remise quand elle existe', () => {
    const doc = buildInvoiceDocument({ sale: { ...sale, discount: 250 }, business });
    expect(doc.discount).toBe('250');
  });

  it("n'affirme jamais « Payée » sur une vente annulée (§25)", () => {
    const doc = buildInvoiceDocument({
      sale: { ...sale, status: 'CANCELLED', note: 'Erreur de saisie' },
      business,
    });
    expect(doc.cancelled).toBe(true);
    expect(doc.paymentStatus).toBe('Annulée');
    expect(doc.footer).toContain('ne vaut pas justificatif');
    expect(doc.footer).toContain('Erreur de saisie');
  });

  it('remercie le client sur une vente valide', () => {
    expect(buildInvoiceDocument({ sale, business }).footer).toBe('Merci pour votre confiance !');
  });
});

describe('invoiceFileName', () => {
  it('nomme le fichier par la référence de facture', () => {
    expect(invoiceFileName({ reference: 'FA-2026-00124' })).toBe('Facture-FA-2026-00124.pdf');
  });

  it('neutralise ce qui ne peut pas figurer dans un nom de fichier', () => {
    expect(invoiceFileName({ reference: 'FA/2026 00124' })).toBe('Facture-FA-2026-00124.pdf');
  });
});
