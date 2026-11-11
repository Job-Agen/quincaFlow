import { describe, expect, it } from 'vitest';
import { PAGE, largeurApprochee, type BlocTexte } from '../facturePdf';
import { planBonDeCommande } from '../bonDeCommandePdf';
import type { BusinessRow, PurchaseOrder, PurchaseOrderItemRow } from '@/types';

/**
 * La mise en page du bon de commande PDF (§60).
 *
 * Le PDF part chez le fournisseur par WhatsApp : personne ne le relit avant
 * lui. Ces tests gardent ce que l'œil ne revérifie pas à chaque envoi — que
 * rien ne sort de la feuille, que le tableau se pagine, et qu'une commande
 * sans prix ne se présente pas comme une commande gratuite.
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

function ligne(over: Partial<PurchaseOrderItemRow> & { id: string }): PurchaseOrderItemRow {
  return {
    purchase_order_id: 'po_1',
    product_id: 'prd_1',
    product_name: 'Fer à béton 8 mm',
    unit_label: 'barre',
    unit_factor: 1,
    quantity_ordered: 120,
    quantity_received: 0,
    unit_cost: 2750,
    position: 0,
    ...over,
  } as PurchaseOrderItemRow;
}

function commande(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po_1',
    business_id: 'biz_1',
    reference: 'PO-0042',
    supplier_id: 'sup_1',
    supplier_name: 'Bâtir Plus',
    manager_name: 'Kossi Amegan',
    status: 'DRAFT',
    total_estimated: 330000,
    amount_paid: 0,
    notes: null,
    created_at: '2026-11-11T09:20:00.000Z',
    updated_at: '2026-11-11T09:20:00.000Z',
    items: [ligne({ id: 'poi_1' })],
    receipts: [],
    documents: [],
    payments: [],
    received: 0,
    balance: 0,
    ...over,
  } as PurchaseOrder;
}

const plan = (order = commande()) => planBonDeCommande(order, BOUTIQUE, 'FCFA');
const textes = (p = plan()) =>
  p.pages
    .flatMap((page) => page.blocs)
    .filter((bloc): bloc is BlocTexte => bloc.type === 'texte')
    .map((bloc) => bloc.texte);

describe('le bon de commande en PDF (§60)', () => {
  it('nomme la boutique, le fournisseur et la pièce', () => {
    const vus = textes();
    expect(vus).toContain('Quincaillerie Le Bâtisseur');
    expect(vus).toContain('BON DE COMMANDE');
    expect(vus).toContain('PO-0042');
    expect(vus).toContain('Bâtir Plus');
    expect(vus).toContain('COMMANDE ADRESSÉE À');
  });

  it('porte le numéro du bon sur le fichier lui-même', () => {
    // C'est ce que le fournisseur verra dans sa messagerie.
    expect(plan().nomFichier).toBe('PO-0042.pdf');
  });

  it('arrête le total en lettres, qu’un chiffre retouché contredirait', () => {
    expect(textes().join(' ')).toMatch(/Arrêté le présent bon de commande à la somme de/);
    expect(textes().join(' ')).toMatch(/trois cent trente mille FCFA/);
  });

  it('devient une demande de prix quand aucun coût n’est saisi', () => {
    const sansPrix = textes(plan(commande({ items: [ligne({ id: 'poi_1', unit_cost: 0 })] })));
    expect(sansPrix).toContain('DEMANDE DE PRIX');
    expect(sansPrix).not.toContain('BON DE COMMANDE');
    // « 0 FCFA » en bas de page se lirait comme une commande gratuite.
    expect(sansPrix).not.toContain('TOTAL ESTIMÉ');
    expect(sansPrix.join(' ')).toMatch(/communiquer vos prix et vos délais/);
    // Et les deux colonnes de montants n'ont plus de raison d'être.
    expect(sansPrix.some((t) => t.startsWith('COÛT'))).toBe(false);
  });

  it('pousse la colonne des quantités au bord quand il n’y a pas de prix', () => {
    // Laissée au milieu, elle donnait un tableau à moitié vide sous un filet
    // qui, lui, allait jusqu'à la marge : le fournisseur y cherchait une
    // colonne effacée.
    const bord = (p = plan()) => {
      const qte = p.pages[0]!.blocs.find(
        (bloc): bloc is BlocTexte => bloc.type === 'texte' && bloc.texte === 'QTÉ'
      )!;
      const filet = p.pages[0]!.blocs.find((bloc) => bloc.type === 'filet')!;
      return { x: qte.x, finDuTableau: filet.type === 'filet' ? filet.x2 : 0 };
    };

    const sansPrix = bord(plan(commande({ items: [ligne({ id: 'poi_1', unit_cost: 0 })] })));
    expect(sansPrix.x).toBe(sansPrix.finDuTableau);

    // Avec des prix, elle reprend sa place : deux colonnes la suivent.
    const avecPrix = bord();
    expect(avecPrix.x).toBeLessThan(avecPrix.finDuTableau - 100);
  });

  it('fait signer les deux parties, sauf si la commande est annulée', () => {
    expect(textes()).toContain('Le fournisseur');
    expect(textes()).toContain('Le gérant');
    // Chacune est nommée au-dessus de son trait (§62) : « Le fournisseur »
    // tout seul ne dit pas qui signe quand le bon circule entre trois dépôts.
    //
    // Et chacun sous SON libellé : vérifier leur seule présence laisserait
    // passer deux noms intervertis, qui feraient signer le fournisseur à la
    // place du gérant.
    const blocs = plan().pages.at(-1)!.blocs.filter(
      (bloc): bloc is BlocTexte => bloc.type === 'texte'
    );
    const sous = (libelle: string) => {
      const etiquette = blocs.find((bloc) => bloc.texte === libelle)!;
      return blocs.find((bloc) => bloc.x === etiquette.x && bloc.y === etiquette.y - 13)?.texte;
    };
    expect(sous('Le gérant')).toBe('Kossi Amegan');
    expect(sous('Le fournisseur')).toBe('Bâtir Plus');

    // Faire signer un bon annulé reviendrait à le remettre en vigueur.
    const annulee = textes(plan(commande({ status: 'CANCELLED' })));
    expect(annulee).not.toContain('Le fournisseur');
    expect(annulee.join(' ')).toMatch(/COMMANDE ANNULÉE/);
    expect(annulee.join(' ')).toMatch(/ne vaut pas bon de commande/);
    // Ni somme en lettres : il n'y a plus de somme à arrêter.
    expect(annulee.join(' ')).not.toMatch(/Arrêté le présent bon/);
  });

  it('reprend les observations du gérant', () => {
    const avecNote = textes(plan(commande({ notes: 'Livraison souhaitée avant vendredi.' })));
    expect(avecNote.join(' ')).toMatch(/Observations : Livraison souhaitée avant vendredi/);
  });

  it('annonce un projet quand la commande n’est pas encore enregistrée', () => {
    // La saisie en cours n'a pas de numéro : la pièce doit le dire, sans quoi
    // le fournisseur la classe comme un bon ferme et livre (§60bis).
    // Un projet n'est pas une `PurchaseOrder` : il n'a ni numéro ni statut.
    // C'est tout l'intérêt du type plus pauvre que le plan accepte.
    const base = commande();
    const p = planBonDeCommande(
      { ...base, reference: null, status: null },
      BOUTIQUE,
      'FCFA'
    );
    const vus = textes(p);

    // Le tiret cadratin devient un trait d'union : les polices PDF de base
    // n'encodent que le latin-1, et `latin1()` le remplace plutôt que
    // d'échouer. Le test attend donc ce que la pièce portera vraiment.
    expect(vus).toContain('PROJET - NON ENREGISTRÉ');
    expect(vus).toContain('Projet');
    expect(vus.join(' ')).toMatch(/ne vaut ni commande ni engagement/);
    // Rien à signer : une pièce sans numéro, signée, ne se retrouve nulle part
    // le jour où l'un des deux la cite.
    expect(vus).not.toContain('Le fournisseur');
    expect(vus.join(' ')).toMatch(/à confirmer avant toute livraison/);
    // Et le fichier ne peut pas porter un numéro qui n'existe pas.
    expect(p.nomFichier).toBe('projet-de-commande.pdf');
    // « Arrêté le présent bon de commande » est la formule d'une pièce ferme :
    // sur un projet elle contredirait la mention qui la suit.
    expect(vus.join(' ')).toMatch(/Montant estimé : trois cent trente mille FCFA/);
    expect(vus.join(' ')).not.toMatch(/Arrêté le présent bon/);
  });

  it('ne pose rien hors de la feuille, texte compris', () => {
    // Vérifier le seul point d'ancrage ne suffit pas : une mention centrée au
    // milieu de la feuille mais alignée à gauche sortirait du papier par la
    // droite, sans que rien ne le dise.
    const tous = plan(
      commande({
        notes: 'Merci de livrer avant vendredi, le chantier de Kpalimé attend le ciment.',
        items: Array.from({ length: 10 }, (_, i) =>
          ligne({ id: `poi_${i}`, product_name: 'Tôle bac aluminium nervurée 3 m × 0,90 m' })
        ),
      })
    ).pages.flatMap((page) => page.blocs);

    for (const bloc of tous) {
      expect(bloc.y).toBeGreaterThanOrEqual(0);
      expect(bloc.y).toBeLessThanOrEqual(PAGE.hauteur);
      if (bloc.type === 'filet') {
        expect(bloc.x1).toBeGreaterThanOrEqual(0);
        expect(bloc.x2).toBeLessThanOrEqual(PAGE.largeur);
        continue;
      }
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
    expect(plan().pages).toHaveLength(1);
    const longue = plan(
      commande({ items: Array.from({ length: 40 }, (_, i) => ligne({ id: `poi_${i}` })) })
    );
    expect(longue.pages.length).toBeGreaterThan(1);
  });

  it('redessine l’en-tête de colonnes sur chaque page', () => {
    const longue = plan(
      commande({ items: Array.from({ length: 40 }, (_, i) => ligne({ id: `poi_${i}` })) })
    );
    for (const page of longue.pages) {
      const vus = page.blocs
        .filter((bloc): bloc is BlocTexte => bloc.type === 'texte')
        .map((bloc) => bloc.texte);
      expect(vus).toContain('DÉSIGNATION');
    }
  });

  it('pose les signatures sous le contenu et au-dessus du pied', () => {
    // Trouvé en regardant un PDF, pas en lisant le code : à vingt et une
    // lignes, le total tenait sur la première page et les signatures
    // basculaient seules sur une seconde, blanche. La césure emporte
    // désormais tout le bas de la pièce d'un bloc — ce test garde l'effet
    // recherché, pas la mécanique : les traits à signer tiennent dans
    // l'espace libre entre le dernier texte et le filet du pied.
    for (let n = 1; n <= 48; n += 1) {
      const p = plan(
        commande({
          notes: n % 3 === 0 ? 'Livraison avant vendredi, chantier de Kpalimé.' : null,
          items: Array.from({ length: n }, (_, i) => ligne({ id: `poi_${i}` })),
        })
      );
      const page = p.pages.find((une) =>
        une.blocs.some((bloc) => bloc.type === 'texte' && bloc.texte === 'Le gérant')
      );
      expect(page, `${n} lignes : aucune page ne porte les signatures`).toBeDefined();

      const signature = page!.blocs.find(
        (bloc): bloc is BlocTexte => bloc.type === 'texte' && bloc.texte === 'Le gérant'
      )!;
      // Le filet du pied est le plus bas de la page : c'est le plancher.
      const pied = Math.min(
        ...page!.blocs.filter((bloc) => bloc.type === 'filet').map((bloc) => bloc.y)
      );
      // Le trait à signer court 24 points sous son libellé ; il ne doit pas
      // venir mordre le pied de page.
      expect(signature.y - 24, `${n} lignes : trait sous le pied`).toBeGreaterThan(pied);

      // Et rien du contenu ne doit descendre dans la bande des signatures.
      //
      // Le bloc des signatures, ce sont les deux libellés et, depuis le §62,
      // les deux noms posés treize points dessous. On les reconnaît à leur
      // hauteur plutôt qu'à leur texte : exclure « Bâtir Plus » par son nom
      // excuserait aussi celui de l'encadré du destinataire, tout en haut.
      const bande = new Set([signature.y, signature.y - 13]);
      const contenu = page!.blocs.filter(
        (bloc): bloc is BlocTexte =>
          bloc.type === 'texte' && !bande.has(bloc.y) && bloc.y > pied + 4
      );
      for (const bloc of contenu) {
        expect(bloc.y, `${n} lignes : « ${bloc.texte} » chevauche les signatures`).toBeGreaterThan(
          signature.y
        );
      }
    }
  });

  it('ne produit jamais une page qui ne porte que des signatures', () => {
    // Trouvé en regardant un PDF, pas en lisant le code : à vingt et une
    // lignes, le total tenait sur la première page et les signatures
    // basculaient seules sur une seconde, blanche. Le fournisseur recevait
    // une page vide portant deux traits à signer.
    for (let n = 1; n <= 48; n += 1) {
      const p = plan(
        commande({
          notes: n % 3 === 0 ? 'Livraison avant vendredi, chantier de Kpalimé.' : null,
          items: Array.from({ length: n }, (_, i) => ligne({ id: `poi_${i}` })),
        })
      );
      for (const [index, page] of p.pages.entries()) {
        const vus = page.blocs
          .filter((bloc): bloc is BlocTexte => bloc.type === 'texte')
          .map((bloc) => bloc.texte);
        // Toute page porte du tableau, ou le décompte qui le clôt.
        const porteQuelqueChose = vus.includes('DÉSIGNATION') || vus.includes('TOTAL ESTIMÉ');
        expect(porteQuelqueChose, `${n} lignes, page ${index + 1} : ${vus.join(' | ')}`).toBe(true);
      }
    }
  });

  it('ne garde le total que sur la dernière page', () => {
    const longue = plan(
      commande({ items: Array.from({ length: 40 }, (_, i) => ligne({ id: `poi_${i}` })) })
    );
    const avecTotal = longue.pages.filter((page) =>
      page.blocs.some((bloc) => bloc.type === 'texte' && bloc.texte === 'TOTAL ESTIMÉ')
    );
    expect(avecTotal).toHaveLength(1);
  });

  it('remplace ce qu’une police PDF ne sait pas écrire plutôt que d’échouer', () => {
    // Un nom de produit est du texte libre : mieux vaut un caractère manquant
    // qu'un bon de commande qui ne part pas.
    const vus = textes(
      plan(commande({ items: [ligne({ id: 'poi_1', product_name: 'Clou 🔨 de 10' })] }))
    );
    expect(vus.some((t) => t.includes('Clou ? de 10'))).toBe(true);
  });
});
