import { describe, expect, it } from 'vitest';
import { purchaseOrderHtml } from '../purchaseOrderHtml';
import { orderTotal } from '../purchase';

/**
 * Le bon de commande en A4 (§43).
 *
 * Ce document part chez un fournisseur et y reste : il l'imprime, le classe, le
 * ressort à la livraison. Les tests gardent ce qui l'engage — le format, les
 * montants, l'identité — et le fait qu'une donnée saisie par le gérant ne peut
 * pas casser la page.
 */

const boutique = {
  name: 'Quincaillerie Kossi',
  tagline: 'Matériaux & outillage',
  address: 'Lomé — Bè-Kpota',
  phone: '90 11 22 33',
};

const lignes = [
  { productName: 'Ciment Diamond 50 kg', unitLabel: 'sac', quantity: 40, unitCost: 3800 },
  { productName: 'Fer à béton 8 mm', unitLabel: 'barre', quantity: 20, unitCost: 4500 },
];

const entete = {
  reference: 'PO-0042',
  supplierName: 'Ets Kodjo & Fils',
  createdAt: '2026-10-11T09:00:00Z',
};

/** Chiffres seuls : l'espace fine insécable varie avec la version d'ICU. */
const chiffres = (t: string) => t.replace(/[^0-9]/g, '');

describe('le format', () => {
  it('est une page A4, en millimètres', () => {
    const html = purchaseOrderHtml(entete, lignes, boutique);
    expect(html).toMatch(/@page\s*\{\s*size:\s*A4/);
    expect(html).toMatch(/margin:\s*\d+mm/);
  });

  it('est un document autonome : rien à charger pour l’afficher', () => {
    const html = purchaseOrderHtml(entete, lignes, boutique);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    // `expo-print` rend la page hors de l'application : un lien externe ne
    // serait pas résolu, et la feuille sortirait sans sa mise en forme.
    expect(html).not.toMatch(/<link\b|<script\b|src=/);
  });
});

describe('ce qui engage les deux parties', () => {
  it('porte l’identité de la boutique', () => {
    const html = purchaseOrderHtml(entete, lignes, boutique);
    expect(html).toContain('QUINCAILLERIE KOSSI');
    expect(html).toContain('Lomé — Bè-Kpota');
    expect(html).toContain('90 11 22 33');
  });

  it('porte le numéro fiscal, que le fournisseur recopie sur sa facture', () => {
    const html = purchaseOrderHtml(entete, lignes, { ...boutique, tax_id: '1000123456789' });
    expect(html).toContain('IFU / NIF : 1000123456789');
    // Sans numéro, pas d'étiquette vide : la ligne disparaît entièrement.
    expect(purchaseOrderHtml(entete, lignes, boutique)).not.toContain('IFU / NIF');
  });

  it('porte le numéro, la date et le fournisseur', () => {
    const html = purchaseOrderHtml(entete, lignes, boutique);
    expect(html).toContain('PO-0042');
    expect(html).toContain('11/10/2026');
    expect(html).toContain('Ets Kodjo &amp; Fils');
  });

  it('affiche un total qui est la somme des lignes', () => {
    const html = purchaseOrderHtml(entete, lignes, boutique);
    // 152 000 + 90 000.
    expect(chiffres(html)).toContain('242000');
    expect(orderTotal(lignes.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost })))).toBe(
      242000
    );
  });

  it('reprend les observations', () => {
    expect(purchaseOrderHtml({ ...entete, notes: 'Avant vendredi.' }, lignes, boutique)).toContain(
      'Avant vendredi.'
    );
  });

  it('laisse deux emplacements de signature', () => {
    const html = purchaseOrderHtml(entete, lignes, boutique);
    expect(html).toContain('Le gérant');
    expect(html).toContain('Le fournisseur');
  });
});

describe('sans prix, c’est une demande de prix', () => {
  const sansPrix = lignes.map((l) => ({ ...l, unitCost: 0 }));

  it('change le titre', () => {
    const html = purchaseOrderHtml(entete, sansPrix, boutique);
    expect(html).toContain('DEMANDE DE PRIX');
    expect(html).not.toContain('BON DE COMMANDE');
  });

  it('retire les colonnes de prix et le total', () => {
    const html = purchaseOrderHtml(entete, sansPrix, boutique);
    expect(html).not.toContain('P.U.');
    expect(html).not.toContain('TOTAL ESTIMÉ');
    expect(html).toContain('Merci de nous communiquer vos prix');
  });
});

describe('commande annulée', () => {
  it('le dit sur le papier, et ne fait pas signer', () => {
    const html = purchaseOrderHtml({ ...entete, cancelled: true }, lignes, boutique);
    expect(html).toContain('COMMANDE ANNULÉE');
    expect(html).not.toContain('Le fournisseur</span>');
  });
});

describe('une saisie du gérant ne peut pas casser la page', () => {
  it('échappe le nom d’un produit qui contient des chevrons', () => {
    const html = purchaseOrderHtml(
      entete,
      [{ productName: 'Tôle <acier>', unitLabel: 'paquet', quantity: 1, unitCost: 100 }],
      boutique
    );
    expect(html).toContain('Tôle &lt;acier&gt;');
    expect(html).not.toContain('<acier>');
  });

  it('neutralise un script glissé dans une observation', () => {
    const html = purchaseOrderHtml(
      { ...entete, notes: '<script>alert(1)</script>' },
      lignes,
      boutique
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('se passe de boutique, de fournisseur et de numéro', () => {
    const html = purchaseOrderHtml({}, lignes, null);
    expect(html).toContain('BON DE COMMANDE');
    expect(html).not.toContain('Fournisseur :');
    expect(html).not.toContain('N° :');
  });
});
