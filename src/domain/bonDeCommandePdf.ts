import {
  PAGE,
  latin1,
  replie,
  type Bloc,
  type BlocTexte,
  type PlanDocument,
  type PlanPage,
} from './facturePdf';
import { montantEnLettres } from './lettres';
import { PO_STATUS_LABELS, clotureCommande, orderTotal, purchaseOrderHeading } from './purchase';
import { amount, money, quantity, shortDate } from '../utils/format';
import { round2 } from '../utils/money';
import type { BusinessRow, PurchaseOrderStatus } from '@/types';

/**
 * Ce qu'il faut d'une commande pour en tirer une pièce.
 *
 * Volontairement plus pauvre que `PurchaseOrder`, qu'elle accepte tel quel :
 * la saisie en cours n'est pas encore une commande enregistrée, et c'est
 * pourtant la même pièce qu'elle doit produire (§60bis).
 */
export interface CommandeImprimable {
  /** `null` tant que la commande n'est pas enregistrée : c'est un projet. */
  reference: string | null;
  supplier_name: string | null;
  status: PurchaseOrderStatus | null;
  created_at: string;
  notes: string | null;
  /** Le nom qui signe, du côté de la boutique (§62). */
  manager_name?: string | null;
  items: readonly {
    product_name: string;
    unit_label: string | null;
    quantity_ordered: number | string;
    unit_cost: number | string;
  }[];
}

/**
 * Le bon de commande en PDF (§60).
 *
 * Le partage n'envoyait qu'un texte : une liste d'articles et un total, dans le
 * corps du message. Lisible sur un téléphone, mais ce n'est pas une pièce — le
 * fournisseur ne peut ni la classer, ni la signer, ni la donner à son magasin.
 * La facture de vente, elle, partait déjà en PDF joint depuis le §57.
 *
 * Ce module décrit **où** chaque chose se pose, sans rien dessiner, comme le
 * plan de la facture dont il reprend les blocs et le tracé. Il copie
 * délibérément la pièce imprimée (§56) : même en-tête, mêmes colonnes, mêmes
 * signatures. Le fournisseur qui reçoit le PDF et celui qui reçoit la feuille
 * doivent tenir le même document.
 */

const MARGE = 42;
const BAS = 64;

const COL = {
  designation: MARGE,
  quantite: 352,
  prix: 450,
  total: PAGE.largeur - MARGE,
};

const texte = (
  x: number,
  y: number,
  contenu: string,
  taille: number,
  options: { gras?: boolean; aligne?: 'gauche' | 'droite' | 'centre'; gris?: boolean } = {}
): BlocTexte => ({ type: 'texte', x, y, texte: latin1(contenu), taille, ...options });

/** Coupe un libellé trop long pour sa colonne, à la largeur moyenne d'un caractère. */
function tronque(valeur: string, largeur: number, taille: number): string {
  const caracteres = Math.max(4, Math.floor(largeur / (taille * 0.5)));
  return valeur.length <= caracteres ? valeur : `${valeur.slice(0, caracteres - 1)}…`;
}

/**
 * Le plan complet d'un bon de commande, page par page.
 *
 * Sans coûts saisis, ce n'est pas un bon de commande mais une **demande de
 * prix** : le titre change, les deux colonnes de montants disparaissent et le
 * total aussi. « 0 FCFA » en bas d'une page se lirait comme une commande
 * gratuite.
 */
export function planBonDeCommande(
  order: CommandeImprimable,
  business: BusinessRow | null | undefined,
  currency: string
): PlanDocument {
  const annulee = order.status === 'CANCELLED';
  // Sans numéro, la commande n'existe que sur l'écran du gérant. La pièce doit
  // le dire : un fournisseur qui classe un projet comme un bon ferme livrera.
  const projet = !order.reference;
  const total = orderTotal(
    order.items.map((item) => ({ quantity: item.quantity_ordered, unitCost: item.unit_cost }))
  );
  const chiffre = total > 0;
  const pages: PlanPage[] = [];

  let blocs: Bloc[] = [];
  let y = PAGE.hauteur - MARGE;

  // ── En-tête : l'identité à gauche, la pièce à droite (§56).
  const hautEntete = y;
  if (business?.logo) {
    blocs.push({
      type: 'image',
      x: MARGE,
      y: y - 34,
      largeur: 74,
      hauteur: 34,
      source: business.logo,
    });
    y -= 42;
  }
  blocs.push(texte(MARGE, y - 11, business?.name || 'Bon de commande', 13, { gras: true }));
  y -= 24;
  for (const ligne of [
    business?.address,
    business?.phone ? `Tél : ${business.phone}` : null,
    business?.tax_id ? `IFU / NIF : ${business.tax_id}` : null,
  ]) {
    if (!ligne) continue;
    blocs.push(texte(MARGE, y, ligne, 8.5, { gris: true }));
    y -= 11;
  }

  let yDroite = hautEntete - 14;
  blocs.push(texte(COL.total, yDroite, purchaseOrderHeading(chiffre), 19, {
    gras: true,
    aligne: 'droite',
  }));
  yDroite -= 20;
  if (projet) {
    // En toutes lettres sous le titre, pas en petit caractère au pied : c'est
    // la première chose à lire.
    blocs.push(texte(COL.total, yDroite, 'PROJET — NON ENREGISTRÉ', 10, {
      gras: true,
      aligne: 'droite',
    }));
    yDroite -= 16;
  }
  for (const [label, valeur] of [
    ['N°', projet ? '—' : (order.reference ?? '—')],
    ['Date', shortDate(order.created_at)],
    ['Statut', projet ? 'Projet' : PO_STATUS_LABELS[order.status ?? 'DRAFT']],
  ] as const) {
    blocs.push(texte(COL.total - 112, yDroite, label, 8.5, { gris: true, aligne: 'droite' }));
    blocs.push(texte(COL.total, yDroite, valeur, 9, { gras: label === 'N°', aligne: 'droite' }));
    yDroite -= 12;
  }

  y = Math.min(y, yDroite) - 8;
  blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y, epaisseur: 1.4 });
  y -= 22;

  // ── Le destinataire, dans son encadré.
  const hauteurCadre = 34;
  blocs.push({
    type: 'cadre',
    x: MARGE,
    y: y - hauteurCadre + 12,
    largeur: (COL.total - MARGE) * 0.58,
    hauteur: hauteurCadre,
  });
  blocs.push(texte(MARGE + 9, y, 'COMMANDE ADRESSÉE À', 7, { gris: true }));
  blocs.push(texte(MARGE + 9, y - 13, order.supplier_name || '—', 10.5, { gras: true }));
  y -= hauteurCadre + 8;

  // ── Le tableau, paginé : une commande de trente lignes ne tient pas sur une
  //    feuille, et un tableau coupé en deux ne vaut rien.
  // Sans prix, la colonne des quantités prend le bord droit. Laissée au
  // milieu, elle donnait un tableau à moitié vide sous un filet qui, lui,
  // allait jusqu'à la marge : le fournisseur y cherchait une colonne effacée.
  const colQte = chiffre ? COL.quantite : COL.total;
  const enTeteTableau = () => {
    blocs.push(texte(COL.designation, y, 'DÉSIGNATION', 7.5, { gris: true }));
    blocs.push(texte(colQte, y, 'QTÉ', 7.5, { gris: true, aligne: 'droite' }));
    if (chiffre) {
      blocs.push(texte(COL.prix, y, `COÛT (${currency})`, 7.5, { gris: true, aligne: 'droite' }));
      blocs.push(texte(COL.total, y, `TOTAL (${currency})`, 7.5, { gris: true, aligne: 'droite' }));
    }
    y -= 6;
    blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y, epaisseur: 1 });
    y -= 15;
  };
  enTeteTableau();

  order.items.forEach((item) => {
    // On change de page avant d'écrire une ligne qui déborderait, jamais après :
    // le décompte et les signatures réclament leur place.
    if (y < BAS + 150) {
      pages.push({ blocs });
      blocs = [];
      y = PAGE.hauteur - MARGE;
      enTeteTableau();
    }
    // L'unité entre parenthèses derrière le nom, comme à l'impression : dans la
    // colonne des quantités, « 6 seau de 20 L » poussait les montants hors de
    // la feuille.
    const nom = item.unit_label ? `${item.product_name} (${item.unit_label})` : item.product_name;
    blocs.push(texte(COL.designation, y, tronque(nom, COL.quantite - MARGE - 14, 9), 9));
    blocs.push(texte(colQte, y, quantity(item.quantity_ordered), 9, { aligne: 'droite' }));
    if (chiffre) {
      blocs.push(texte(COL.prix, y, amount(item.unit_cost), 9, { aligne: 'droite' }));
      blocs.push(
        texte(
          COL.total,
          y,
          amount(round2(Number(item.quantity_ordered) * Number(item.unit_cost))),
          9,
          { aligne: 'droite' }
        )
      );
    }
    y -= 6;
    blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y, epaisseur: 0.4 });
    y -= 15;
  });

  // ── Ce qui suit le tableau tient d'un seul tenant.
  //
  // Total, somme en lettres, observations et signatures forment le bas de la
  // pièce : coupés entre eux, ils donnaient une seconde page blanche portant
  // deux traits à signer. On mesure donc leur hauteur avant d'écrire, et on
  // change de page entier plutôt que par moitié.
  const lignesNotes = order.notes ? replie(`Observations : ${order.notes.trim()}`, 100).length : 0;
  const besoin =
    (chiffre ? 58 + (annulee ? 0 : 24) : 24) +
    lignesNotes * 12 +
    (annulee || projet ? 16 : 68) +
    24;
  if (y - besoin < BAS + 30) {
    pages.push({ blocs });
    blocs = [];
    y = PAGE.hauteur - MARGE;
  }

  y -= 10;
  const gauche = COL.total - 230;
  if (chiffre) {
    blocs.push({ type: 'filet', x1: gauche, x2: COL.total, y: y + 10, epaisseur: 1 });
    y -= 4;
    blocs.push(texte(gauche, y, 'TOTAL ESTIMÉ', 13, { gras: true }));
    blocs.push(texte(COL.total, y, money(total, currency), 13, { gras: true, aligne: 'droite' }));
    y -= 19;
    blocs.push({ type: 'filet', x1: gauche, x2: COL.total, y: y + 10, epaisseur: 1 });
    y -= 12;

    // La somme en lettres n'est pas un ornement : un chiffre se retouche sur un
    // PDF transmis, une somme écrite en toutes lettres se contredit elle-même.
    if (!annulee) {
      // « Arrêté le présent bon de commande » est la formule d'une pièce
      // ferme : sur un projet, elle contredirait la mention qui le suit.
      const phrase = projet
        ? `Montant estimé : ${montantEnLettres(total, currency)}.`
        : `Arrêté le présent bon de commande à la somme de ${montantEnLettres(total, currency)}.`;
      for (const ligne of replie(phrase, 96)) {
        blocs.push(texte(MARGE, y, ligne, 9));
        y -= 12;
      }
    }
  } else {
    for (const ligne of replie(clotureCommande(annulee, false), 96)) {
      blocs.push(texte(MARGE, y, ligne, 9));
      y -= 12;
    }
  }

  // ── Les observations du gérant.
  if (order.notes) {
    y -= 6;
    for (const ligne of replie(`Observations : ${order.notes.trim()}`, 100)) {
      blocs.push(texte(MARGE, y, ligne, 9, { gris: true }));
      y -= 12;
    }
  }

  // ── Les deux signatures, ou la mention d'annulation à leur place.
  //    Faire signer un bon annulé reviendrait à le remettre en vigueur.
  if (annulee) {
    y -= 10;
    blocs.push(
      texte(MARGE, y, 'COMMANDE ANNULÉE — ce document ne vaut pas bon de commande.', 10, {
        gras: true,
      })
    );
  } else if (projet) {
    // Rien à signer : une pièce sans numéro, signée, ne se retrouve nulle part
    // le jour où l'un des deux la cite.
    y -= 10;
    blocs.push(
      texte(MARGE, y, 'Projet de commande — à confirmer avant toute livraison.', 10, { gras: true })
    );
  } else {
    // On signe en bas de la feuille, pas à la suite du texte : des traits
    // flottant au milieu d'une page à moitié blanche font un brouillon, pas
    // une pièce. Si le tableau descend trop bas, les signatures reculent, et
    // au pire passent sur une page à elles plutôt que de chevaucher le pied.
    const ySignature = Math.min(y - 26, BAS + 92);
    // Chaque partie est nommée au-dessus de son trait. « Le fournisseur » tout
    // seul ne dit pas qui doit signer quand la commande circule entre trois
    // dépôts, et « Le gérant » tout seul ne dit pas qui l'a passée.
    for (const [x, qui, nom] of [
      [MARGE, 'Le gérant', (order.manager_name || '').trim()],
      [COL.total - 170, 'Le fournisseur', (order.supplier_name || '').trim()],
    ] as const) {
      blocs.push(texte(x, ySignature, qui, 8, { gris: true }));
      if (nom) blocs.push(texte(x, ySignature - 13, nom, 10, { gras: true }));
      blocs.push({ type: 'filet', x1: x, x2: x + 170, y: ySignature - 30, epaisseur: 0.5 });
    }
  }

  // ── Le pied, posé en bas de page et non à la suite du texte.
  blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y: BAS + 26, epaisseur: 0.4 });
  const pied = [
    business?.name,
    business?.tax_id ? `IFU / NIF : ${business.tax_id}` : null,
    business?.phone ? `Tél : ${business.phone}` : null,
  ]
    .filter(Boolean)
    .join(' - ');
  const mention = annulee
    ? 'Commande annulée. Merci de ne pas donner suite.'
    : projet
      ? "Projet de commande, sans numéro : il ne vaut ni commande ni engagement d'achat. Un bon numéroté suivra."
      : chiffre
        ? 'Prix et quantités à confirmer par le fournisseur avant livraison.'
        : "Document établi pour demande de prix. Il ne vaut pas engagement d'achat.";

  let yPied = BAS + 14;
  for (const ligne of [pied, ...replie(mention, 112)]) {
    blocs.push(texte(PAGE.largeur / 2, yPied, ligne, 7.5, { gris: true, aligne: 'centre' }));
    yPied -= 10;
  }

  pages.push({ blocs });

  return {
    // Ce que le fournisseur verra dans sa messagerie : le numéro du bon, et
    // rien d'autre à déchiffrer.
    nomFichier: projet ? 'projet-de-commande.pdf' : `${order.reference}.pdf`,
    pages,
  };
}
