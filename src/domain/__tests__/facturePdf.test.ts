import { describe, expect, it } from 'vitest';
import {
  PAGE,
  largeurApprochee,
  latin1,
  planFacture,
  replie,
  type BlocTexte,
} from '../facturePdf';
import type { BusinessRow, Sale, SaleItemRow } from '@/types';

/**
 * La mise en page de la facture PDF (§57).
 *
 * Le PDF part chez le client par WhatsApp ou par courriel : personne ne le
 * relira avant lui. Ces tests gardent ce que l'œil ne vérifie pas à chaque
 * envoi — que rien ne sort de la feuille, que le tableau se pagine plutôt que
 * de se faire couper, et qu'un libellé venu d'ailleurs ne fait pas échouer
 * l'envoi tout entier.
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

function article(over: Partial<SaleItemRow> & { id: string }): SaleItemRow {
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
    items: [article({ id: 'sit_1' }), article({ id: 'sit_2', product_name: 'Tuyau PVC 110 mm' })],
    ...over,
  };
}

/** Tous les textes d'un plan, pages confondues. */
const mots = (plan: ReturnType<typeof planFacture>) =>
  plan.pages
    .flatMap((page) => page.blocs)
    .filter((bloc): bloc is BlocTexte => bloc.type === 'texte')
    .map((bloc) => bloc.texte);

const plan = (sale: Sale = vente()) => planFacture(sale, BOUTIQUE, 'FCFA');

describe('ce que le PDF porte', () => {
  it('nomme le vendeur, le client et la pièce', () => {
    const vus = mots(plan()).join(' | ');
    expect(vus).toContain('Quincaillerie Le Bâtisseur');
    expect(vus).toContain('Entreprise BTP Soleil');
    expect(vus).toContain('FA-2026-0002');
    expect(vus).toContain('IFU / NIF : 1000123456789');
  });

  it('arrête la somme en lettres', () => {
    expect(mots(plan()).join(' ')).toContain('quatre-vingt-huit mille FCFA');
  });

  it('chiffre le reste dû, et se tait quand la facture est soldée', () => {
    expect(mots(plan()).join(' | ')).toContain('Reste dû');
    const soldee = plan(vente({ amount_paid: 88000, payment_status: 'PAID' }));
    expect(mots(soldee).join(' | ')).not.toContain('Reste dû');
  });

  it('porte le nom de la facture sur le fichier lui-même', () => {
    // C'est ce que le client verra dans sa messagerie.
    expect(plan().nomFichier).toBe('FA-2026-0002.pdf');
  });
});

describe('les bords de la feuille', () => {
  it('ne pose rien hors de la page, texte compris', () => {
    // Vérifier le seul point d'ancrage ne suffit pas : une mention centrée au
    // milieu de la feuille mais alignée à gauche sortait du papier par la
    // droite, et rien ne le disait.
    const tous = plan(vente({ items: Array.from({ length: 12 }, (_, i) => article({ id: `s${i}` })) }))
      .pages.flatMap((page) => page.blocs);

    for (const bloc of tous) {
      expect(bloc.y).toBeGreaterThanOrEqual(0);
      expect(bloc.y).toBeLessThanOrEqual(PAGE.hauteur);
      if (bloc.type === 'filet') continue;

      const largeur =
        bloc.type === 'texte' ? largeurApprochee(bloc.texte, bloc.taille) : bloc.largeur;
      const aligne = bloc.type === 'texte' ? bloc.aligne : 'gauche';
      const gauche =
        aligne === 'droite' ? bloc.x - largeur : aligne === 'centre' ? bloc.x - largeur / 2 : bloc.x;

      expect(gauche).toBeGreaterThanOrEqual(0);
      expect(gauche + largeur).toBeLessThanOrEqual(PAGE.largeur);
    }
  });

  it('pagine plutôt que de laisser le tableau déborder', () => {
    // Une quincaillerie facture parfois trente lignes ; une facture coupée au
    // milieu de son tableau ne vaut rien.
    const courte = plan();
    expect(courte.pages).toHaveLength(1);

    const longue = plan(
      vente({ items: Array.from({ length: 40 }, (_, i) => article({ id: `s${i}` })) })
    );
    expect(longue.pages.length).toBeGreaterThan(1);
  });

  it('redessine l’en-tête de colonnes sur chaque page', () => {
    const longue = plan(
      vente({ items: Array.from({ length: 40 }, (_, i) => article({ id: `s${i}` })) })
    );
    for (const page of longue.pages) {
      const textes = page.blocs
        .filter((bloc): bloc is BlocTexte => bloc.type === 'texte')
        .map((bloc) => bloc.texte);
      expect(textes).toContain('DÉSIGNATION');
    }
  });

  it('ne garde le décompte que sur la dernière page', () => {
    const longue = plan(
      vente({ items: Array.from({ length: 40 }, (_, i) => article({ id: `s${i}` })) })
    );
    const avecTotal = longue.pages.filter((page) =>
      page.blocs.some((bloc) => bloc.type === 'texte' && bloc.texte === 'TOTAL')
    );
    expect(avecTotal).toHaveLength(1);
  });
});

describe('un texte qu’une police PDF ne sait pas écrire', () => {
  it('remplace ce qui sort du latin-1 plutôt que d’échouer', () => {
    // Mieux vaut une facture où un caractère manque qu'une facture qui ne part
    // pas : un nom de produit est du texte libre.
    expect(latin1('Clou 🔨 de 10')).toBe('Clou ? de 10');
    expect(latin1('Tôle — 2 m')).toBe('Tôle - 2 m');
    expect(latin1('L’éclairage')).toBe("L'éclairage");
  });

  it('laisse les accents français intacts', () => {
    expect(latin1('Fer à béton — Tôle çà et là')).toBe('Fer à béton - Tôle çà et là');
  });

  it('nettoie aussi les libellés venus du catalogue', () => {
    const avecEmoji = plan(
      vente({ items: [article({ id: 'sit_1', product_name: 'Ciment ⭐ CIMTOGO' })] })
    );
    expect(mots(avecEmoji).join(' ')).toContain('Ciment ? CIMTOGO');
  });
});

describe('le repli du texte', () => {
  it('ne coupe pas les mots', () => {
    expect(replie('Arrêtée la présente facture à la somme de mille', 20)).toEqual([
      'Arrêtée la présente',
      'facture à la somme',
      'de mille',
    ]);
  });

  it('rend une seule ligne quand tout tient', () => {
    expect(replie('Total', 20)).toEqual(['Total']);
  });
});
