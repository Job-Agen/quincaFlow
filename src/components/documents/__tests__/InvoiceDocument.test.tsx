import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import InvoiceDocument from '../InvoiceDocument';
import type { BusinessRow, Sale, SaleItemRow } from '@/types';

/**
 * La facture, montée (§15, §56).
 *
 * C'est la seule pièce que le client emporte, et la seule qu'une entreprise
 * cliente présentera à son comptable. Ces tests gardent ce qui l'engage :
 * l'identité du vendeur, celle du destinataire, le décompte, la somme en
 * lettres — et les deux endroits où une facture peut mentir, le reste dû et le
 * statut d'une vente annulée.
 */

const BOUTIQUE: BusinessRow = {
  id: 'biz_1',
  name: 'Quincaillerie Le Bâtisseur',
  phone: '+228 90 11 22 33',
  address: 'Avenue de l’Indépendance, Lomé',
  tagline: 'Tout pour construire',
  tax_id: '1000123456789',
  logo: null,
  currency: 'FCFA',
};

function ligne(over: Partial<SaleItemRow> & { id: string }): SaleItemRow {
  return {
    product_id: 'prd_1',
    product_name: 'Fer à béton 8 mm',
    unit_label: 'barre',
    unit_factor: 1,
    quantity: 20,
    unit_price: 3100,
    line_total: 62000,
    unit_cost: 2600,
    ...over,
  };
}

/** 88 000 au total, dont 50 000 encaissés : 38 000 restent dus. */
function vente(over: Partial<Sale> = {}): Sale {
  return {
    id: 'sal_1',
    business_id: 'biz_1',
    reference: 'VE-0002',
    invoice_reference: 'FA-2026-0002',
    customer_id: 'cus_1',
    customer_name: 'Entreprise BTP Soleil',
    user_id: 'usr_1',
    subtotal: 88000,
    discount: 0,
    total: 88000,
    cost_of_goods: 62000,
    payment_method: 'MOBILE_MONEY',
    payment_provider: 'FLOOZ',
    amount_paid: 50000,
    payment_status: 'PARTIAL',
    status: 'COMPLETED',
    note: null,
    created_at: '2026-10-12T07:25:00.000Z',
    updated_at: '2026-10-12T07:25:00.000Z',
    items: [ligne({ id: 'sit_1' }), ligne({ id: 'sit_2', product_name: 'Tuyau PVC 110 mm' })],
    ...over,
  };
}

const afficher = (sale: Sale) => {
  const { container } = render(
    <InvoiceDocument sale={sale} business={BOUTIQUE} currency="FCFA" />
  );
  return (container.textContent || '').replace(/\s+/g, ' ');
};

describe('ce que la facture engage', () => {
  it('dit qui vend, avec son numéro fiscal', () => {
    const vu = afficher(vente());
    expect(vu).toContain('Quincaillerie Le Bâtisseur');
    expect(vu).toContain('IFU / NIF : 1000123456789');
  });

  it('dit qui doit payer, dans son propre bloc', () => {
    const vu = afficher(vente());
    expect(vu).toContain('Facturé à');
    expect(vu).toContain('Entreprise BTP Soleil');
  });

  it('nomme le client comptoir plutôt que de laisser le bloc vide', () => {
    expect(afficher(vente({ customer_id: null, customer_name: null }))).toContain(
      'Client comptoir'
    );
  });

  it('porte le numéro de pièce, la date et la vente', () => {
    const vu = afficher(vente());
    expect(vu).toContain('FA-2026-0002');
    expect(vu).toContain('VE-0002');
  });

  it('nomme la devise en tête de colonne, et non à chaque ligne', () => {
    // Vingt fois « FCFA » dans une colonne mange la largeur du libellé.
    const vu = afficher(vente());
    expect(vu).toContain('Prix (FCFA)');
    expect(vu).toContain('Total (FCFA)');
  });
});

describe('le décompte', () => {
  it('chiffre le reste dû quand la vente n’est pas soldée', () => {
    const vu = afficher(vente());
    expect(vu).toContain('Montant réglé');
    expect(vu).toContain('Reste dû');
  });

  it('n’affiche aucun reste dû sur une facture acquittée', () => {
    // « Reste dû : 0 » sur une facture soldée sème un doute pour rien.
    const vu = afficher(vente({ amount_paid: 88000, payment_status: 'PAID' }));
    expect(vu).not.toContain('Reste dû');
    expect(vu).not.toContain('Montant réglé');
  });

  it('montre le sous-total seulement lorsqu’une remise s’applique', () => {
    expect(afficher(vente())).not.toContain('Sous-total');
    const remisee = afficher(vente({ subtotal: 90000, discount: 2000 }));
    expect(remisee).toContain('Sous-total');
    expect(remisee).toContain('Remise');
  });
});

describe('la somme en toutes lettres', () => {
  it('arrête la facture à sa somme, écrite', () => {
    // Un chiffre se retouche au stylo ; une somme en lettres, non.
    const vu = afficher(vente());
    expect(vu).toContain('Arrêtée la présente facture à la somme de');
    expect(vu).toContain('quatre-vingt-huit mille FCFA');
  });

  it('n’arrête aucune somme sur une vente annulée', () => {
    expect(afficher(vente({ status: 'CANCELLED' }))).not.toContain(
      'Arrêtée la présente facture'
    );
  });
});

describe('une vente annulée', () => {
  it('ne se prévaut plus d’avoir été payée', () => {
    // L'encaissement a été rendu : afficher « Payée » affirmerait du faux.
    const vu = afficher(
      vente({ status: 'CANCELLED', amount_paid: 88000, payment_status: 'PAID' })
    );
    expect(vu).toContain('Annulée');
    expect(vu).not.toContain('Payée');
    expect(vu).toContain('ne vaut pas justificatif');
  });
});

describe('le pied de page', () => {
  it('rappelle la réserve de propriété tant qu’il reste dû', () => {
    expect(afficher(vente())).toContain('restent la propriété du vendeur');
  });

  it('déclare la facture acquittée une fois soldée', () => {
    const vu = afficher(vente({ amount_paid: 88000, payment_status: 'PAID' }));
    expect(vu).toContain('Facture acquittée');
  });
});
