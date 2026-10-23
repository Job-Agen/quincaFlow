import { saleBalance } from './credit';
import { montantEnLettres } from './lettres';
import { PAYMENT_STATUS_LABELS, paymentLabel } from './sale';
import { amount, dateTime, money, quantity } from '../utils/format';
import type { BusinessRow, Sale } from '@/types';

/**
 * La facture en PDF (§57).
 *
 * Le navigateur sait déjà l'imprimer (§56) ; il ne sait pas la joindre à un
 * message. Pour qu'elle parte par WhatsApp ou par courriel, il faut un fichier
 * — et le même des deux côtés : le téléphone le fabrique pour le partage natif,
 * le serveur pour la pièce jointe d'un courriel. Deux constructeurs auraient
 * divergé au premier changement de mise en page.
 *
 * D'où la coupure : ce module décrit **où** chaque chose se pose, en points PDF,
 * sans rien dessiner. Le tracé, lui, tient en quelques lignes et vit à côté.
 * C'est ce qui rend la mise en page vérifiable — un test lit un plan, pas un
 * fichier binaire.
 *
 * Le repère est celui du PDF : l'origine en bas à gauche, les ordonnées vers le
 * haut. On écrit donc la page de haut en bas en décrémentant `y`.
 */

/** A4 en points, l'unité du PDF : 72 par pouce. */
export const PAGE = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 42;
const BAS = 64;

export interface BlocTexte {
  type: 'texte';
  x: number;
  y: number;
  texte: string;
  taille: number;
  gras?: boolean;
  /**
   * `droite` : `x` est le bord droit. `centre` : `x` est le milieu.
   * Dans les deux cas c'est le tracé qui décale, lui seul connaissant la
   * largeur réelle du texte dans sa police.
   */
  aligne?: 'gauche' | 'droite' | 'centre';
  gris?: boolean;
}

export interface BlocFilet {
  type: 'filet';
  x1: number;
  x2: number;
  y: number;
  epaisseur: number;
}

export interface BlocCadre {
  type: 'cadre';
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface BlocImage {
  type: 'image';
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** `data:` URL du logo (§51). */
  source: string;
}

export type Bloc = BlocTexte | BlocFilet | BlocCadre | BlocImage;

export interface PlanPage {
  blocs: Bloc[];
}

export interface PlanFacture {
  nomFichier: string;
  pages: PlanPage[];
}

/**
 * Remplace ce qu'une police PDF standard ne sait pas écrire.
 *
 * Les polices de base n'encodent que le latin-1. Un nom de produit est du texte
 * libre : un caractère venu d'ailleurs — une émoticône collée dans un libellé,
 * un caractère chinois — ferait échouer le tracé et, avec lui, tout l'envoi.
 * Mieux vaut une facture où un caractère manque qu'une facture qui ne part pas.
 */
export function latin1(texte: string): string {
  return [...texte]
    .map((caractere) => {
      const code = caractere.codePointAt(0) ?? 32;
      if (code < 0x100) return caractere;
      const connus: Record<string, string> = {
        '’': "'",
        '‘': "'",
        '“': '"',
        '”': '"',
        '–': '-',
        '—': '-',
        '…': '...',
        '€': 'EUR',
        ' ': ' ',
        ' ': ' ',
        '·': '-',
      };
      return connus[caractere] ?? '?';
    })
    .join('');
}

const texte = (
  x: number,
  y: number,
  contenu: string,
  taille: number,
  options: { gras?: boolean; aligne?: 'gauche' | 'droite' | 'centre'; gris?: boolean } = {}
): BlocTexte => ({ type: 'texte', x, y, texte: latin1(contenu), taille, ...options });

/**
 * Largeur approchée d'un texte, pour décider des retours à la ligne.
 *
 * Le plan ne connaît pas la police : il raisonne sur une largeur moyenne de
 * caractère. L'approximation suffit pour replier une phrase ; l'alignement
 * exact, lui, est calculé au tracé.
 */
export const largeurApprochee = (contenu: string, taille: number) => contenu.length * taille * 0.5;

/** Coupe un libellé trop long pour sa colonne, à la largeur moyenne d'un caractère. */
function tronque(valeur: string, largeur: number, taille: number): string {
  const caracteres = Math.max(4, Math.floor(largeur / (taille * 0.5)));
  return valeur.length <= caracteres ? valeur : `${valeur.slice(0, caracteres - 1)}…`;
}

/** Colonnes du tableau : bord gauche pour le libellé, bord droit pour les nombres. */
const COL = {
  designation: MARGE,
  quantite: 360,
  prix: 450,
  total: PAGE.largeur - MARGE,
};

/**
 * Le plan complet d'une facture, page par page.
 *
 * Les articles sont paginés : une quincaillerie facture parfois trente lignes,
 * et une facture coupée au milieu de son tableau ne vaut rien. L'en-tête de
 * colonnes est redessiné sur chaque page, le décompte ne figure que sur la
 * dernière.
 */
export function planFacture(
  sale: Sale,
  business: BusinessRow | null | undefined,
  currency: string
): PlanFacture {
  const annulee = sale.status === 'CANCELLED';
  const reste = saleBalance(sale.total, sale.amount_paid);
  const pages: PlanPage[] = [];

  let blocs: Bloc[] = [];
  let y = PAGE.hauteur - MARGE;

  // ── En-tête : l'identité à gauche, la pièce à droite (§56).
  const hautEntete = y;
  if (business?.logo) {
    blocs.push({ type: 'image', x: MARGE, y: y - 34, largeur: 74, hauteur: 34, source: business.logo });
    y -= 42;
  }
  blocs.push(texte(MARGE, y - 11, business?.name || 'Facture', 13, { gras: true }));
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
  blocs.push(texte(COL.total, yDroite, 'FACTURE', 19, { gras: true, aligne: 'droite' }));
  yDroite -= 20;
  for (const [label, valeur] of [
    ['N°', sale.invoice_reference],
    ['Date', dateTime(sale.created_at)],
    ['Vente', sale.reference],
  ] as const) {
    blocs.push(texte(COL.total - 112, yDroite, label, 8.5, { gris: true, aligne: 'droite' }));
    blocs.push(texte(COL.total, yDroite, valeur, 9, { gras: label === 'N°', aligne: 'droite' }));
    yDroite -= 12;
  }

  y = Math.min(y, yDroite) - 8;
  blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y, epaisseur: 1.4 });
  y -= 22;

  // ── Le destinataire, dans son encadré sur une moitié de largeur.
  const hauteurCadre = 34;
  blocs.push({
    type: 'cadre',
    x: MARGE,
    y: y - hauteurCadre + 12,
    largeur: (COL.total - MARGE) * 0.58,
    hauteur: hauteurCadre,
  });
  blocs.push(texte(MARGE + 9, y, 'FACTURÉ À', 7, { gris: true }));
  blocs.push(texte(MARGE + 9, y - 13, sale.customer_name || 'Client comptoir', 10.5, { gras: true }));
  y -= hauteurCadre + 8;

  // ── Le tableau, paginé.
  const enTeteTableau = () => {
    blocs.push(texte(COL.designation, y, 'DÉSIGNATION', 7.5, { gris: true }));
    blocs.push(texte(COL.quantite, y, 'QTÉ', 7.5, { gris: true, aligne: 'droite' }));
    blocs.push(texte(COL.prix, y, `PRIX (${currency})`, 7.5, { gris: true, aligne: 'droite' }));
    blocs.push(texte(COL.total, y, `TOTAL (${currency})`, 7.5, { gris: true, aligne: 'droite' }));
    y -= 6;
    blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y, epaisseur: 1 });
    y -= 15;
  };
  enTeteTableau();

  sale.items.forEach((item) => {
    // Le décompte final réclame sa place : on change de page avant d'écrire une
    // ligne qui déborderait, jamais après.
    if (y < BAS + 120) {
      pages.push({ blocs });
      blocs = [];
      y = PAGE.hauteur - MARGE;
      enTeteTableau();
    }
    const nom =
      item.unit_factor > 1 ? `${item.product_name} (${item.unit_label})` : item.product_name;
    blocs.push(texte(COL.designation, y, tronque(nom, COL.quantite - MARGE - 14, 9), 9));
    blocs.push(texte(COL.quantite, y, quantity(item.quantity), 9, { aligne: 'droite' }));
    blocs.push(texte(COL.prix, y, amount(item.unit_price), 9, { aligne: 'droite' }));
    blocs.push(texte(COL.total, y, amount(item.line_total), 9, { aligne: 'droite' }));
    y -= 6;
    blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y, epaisseur: 0.4 });
    y -= 15;
  });

  // ── Le décompte, aligné à droite.
  y -= 10;
  const gauche = COL.total - 230;
  const ligneTotal = (label: string, valeur: string, taille = 9.5, gras = false) => {
    blocs.push(texte(gauche, y, label, taille, { gras }));
    blocs.push(texte(COL.total, y, valeur, taille, { gras, aligne: 'droite' }));
    y -= taille + 6;
  };

  if (sale.discount > 0) {
    ligneTotal('Sous-total', money(sale.subtotal, currency));
    ligneTotal('Remise', `- ${money(sale.discount, currency)}`);
  }
  blocs.push({ type: 'filet', x1: gauche, x2: COL.total, y: y + 10, epaisseur: 1 });
  y -= 4;
  ligneTotal('TOTAL', money(sale.total, currency), 13, true);
  blocs.push({ type: 'filet', x1: gauche, x2: COL.total, y: y + 10, epaisseur: 1 });
  y -= 6;

  if (reste > 0) {
    ligneTotal('Montant réglé', money(sale.amount_paid, currency));
    ligneTotal('Reste dû', money(reste, currency), 10.5, true);
  }

  // ── La somme en lettres, puis le règlement.
  y -= 10;
  if (!annulee) {
    const phrase = `Arrêtée la présente facture à la somme de ${montantEnLettres(sale.total, currency)}.`;
    // Repliée à la main : le tracé ne sait pas renvoyer à la ligne tout seul.
    for (const ligne of replie(phrase, 96)) {
      blocs.push(texte(MARGE, y, ligne, 9));
      y -= 12;
    }
  }

  y -= 4;
  blocs.push(
    texte(MARGE, y, `Règlement : ${paymentLabel(sale.payment_method, sale.payment_provider)}`, 9, {
      gris: true,
    })
  );
  blocs.push(
    texte(COL.total, y, annulee ? 'ANNULÉE' : PAYMENT_STATUS_LABELS[sale.payment_status], 9, {
      gras: true,
      aligne: 'droite',
    })
  );

  // ── Le pied, posé en bas de page et non à la suite du texte.
  blocs.push({ type: 'filet', x1: MARGE, x2: COL.total, y: BAS + 26, epaisseur: 0.4 });
  const pied = [business?.name, business?.tax_id ? `IFU / NIF : ${business.tax_id}` : null]
    .filter(Boolean)
    .join(' - ');
  const mention = annulee
    ? 'Facture annulée. Ce document ne vaut pas justificatif.'
    : reste > 0
      ? 'Facture payable au comptant. Les marchandises restent la propriété du vendeur jusqu’au règlement intégral.'
      : 'Facture acquittée. Aucun montant ne reste dû.';

  // Le pied est centré et replié : une mention plus large que la feuille
  // sortirait simplement du papier, sans que rien ne le signale.
  let yPied = BAS + 14;
  for (const ligne of [pied, ...replie(mention, 112)]) {
    blocs.push(texte(PAGE.largeur / 2, yPied, ligne, 7.5, { gris: true, aligne: 'centre' }));
    yPied -= 10;
  }

  pages.push({ blocs });

  return {
    // Le nom du fichier est ce que le client verra dans sa messagerie : la
    // référence de la facture, et rien d'autre à déchiffrer.
    nomFichier: `${sale.invoice_reference}.pdf`,
    pages,
  };
}

/** Replie un texte à la largeur donnée, en caractères, sans couper les mots. */
export function replie(phrase: string, caracteres: number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of phrase.split(' ')) {
    if (courante && (courante + ' ' + mot).length > caracteres) {
      lignes.push(courante);
      courante = mot;
    } else {
      courante = courante ? `${courante} ${mot}` : mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}
