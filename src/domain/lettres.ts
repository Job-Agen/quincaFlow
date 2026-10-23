/**
 * Un montant écrit en toutes lettres (§56).
 *
 * « Arrêtée la présente facture à la somme de … » n'est pas une coquetterie :
 * c'est la mention qui rend une facture opposable. Un chiffre se retouche au
 * stylo — un 1 devient un 4, un zéro s'ajoute ; une somme en lettres, non. Les
 * administrations et les entreprises de la zone UEMOA la réclament, et une
 * facture qui en manque revient au commerçant.
 *
 * Le franc CFA n'a pas de centimes en pratique : les montants sont arrondis à
 * l'unité. Une décimale qui traînerait d'un calcul de marge serait écrite
 * séparément plutôt que tue.
 */

const UNITES = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];

const DIZAINES = [
  '',
  '',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
];

/**
 * Un nombre de 0 à 99.
 *
 * Les soixante-dix et quatre-vingt-dix s'écrivent en France comme des dizaines
 * composées — soixante-dix, quatre-vingt-dix — et le « et » ne s'emploie que
 * devant un et onze : vingt et un, soixante et onze, mais quatre-vingt-un.
 */
function sousCent(n: number): string {
  if (n < 20) return UNITES[n] as string;

  const dizaine = Math.floor(n / 10);
  const unite = n % 10;
  const base = DIZAINES[dizaine] as string;

  // 70 à 79 et 90 à 99 se comptent par dix : soixante-dix, quatre-vingt-dix.
  if (dizaine === 7 || dizaine === 9) {
    const reste = UNITES[10 + unite] as string;
    return unite === 1 && dizaine === 7 ? `${base} et onze` : `${base}-${reste}`;
  }

  if (unite === 0) {
    // Quatre-vingts prend son s quand rien ne le suit (quatre-vingt-un, non).
    return dizaine === 8 ? `${base}s` : base;
  }
  if (unite === 1 && dizaine !== 8) return `${base} et un`;
  return `${base}-${UNITES[unite]}`;
}

/** Un nombre de 0 à 999. */
function sousMille(n: number): string {
  if (n < 100) return sousCent(n);

  const centaines = Math.floor(n / 100);
  const reste = n % 100;
  // « Cent » prend son s multiplié et non suivi : deux cents, deux cent trois.
  const tete = centaines === 1 ? 'cent' : `${UNITES[centaines]} cent${reste === 0 ? 's' : ''}`;
  return reste === 0 ? tete : `${tete} ${sousCent(reste)}`;
}

/** Les tranches de mille, de la plus petite à la plus grande. */
const ECHELLES = [
  { singulier: 'mille', pluriel: 'mille' },
  { singulier: 'million', pluriel: 'millions' },
  { singulier: 'milliard', pluriel: 'milliards' },
];

/**
 * Un entier positif en toutes lettres.
 *
 * « Mille » est invariable — deux mille, et non deux milles — là où million et
 * milliard sont des noms et prennent leur s.
 */
export function entierEnLettres(valeur: number): string {
  const n = Math.floor(Math.abs(valeur));
  if (n === 0) return 'zéro';
  if (n < 1000) return sousMille(n);

  const tranches: string[] = [];
  let reste = n;
  let rang = -1;

  while (reste > 0) {
    const tranche = reste % 1000;
    reste = Math.floor(reste / 1000);
    rang += 1;
    if (tranche === 0) continue;

    if (rang === 0) {
      tranches.unshift(sousMille(tranche));
      continue;
    }
    const echelle = ECHELLES[rang - 1];
    if (!echelle) break;
    // « Un mille » ne se dit pas : mille seul. « Un million », si.
    const compte =
      tranche === 1 && echelle.singulier === 'mille' ? '' : `${sousMille(tranche)} `;
    tranches.unshift(`${compte}${tranche > 1 ? echelle.pluriel : echelle.singulier}`);
  }

  return tranches.join(' ');
}

/**
 * Le montant d'une facture, en toutes lettres et dans sa devise.
 *
 * La devise est reprise telle que la boutique l'a réglée (§6) : écrire « francs
 * CFA » en dur trahirait une boutique qui compte en cédis ou en nairas.
 */
export function montantEnLettres(montant: number, devise = 'FCFA'): string {
  const arrondi = Math.round(Math.abs(montant) * 100) / 100;
  const entier = Math.floor(arrondi);
  const centimes = Math.round((arrondi - entier) * 100);

  const lettres = `${entierEnLettres(entier)} ${devise}`;
  // Un centime qui traîne d'un calcul de marge se dit plutôt que de disparaître
  // : une somme en lettres qui ne correspond pas au chiffre ne vaut rien.
  return centimes > 0 ? `${lettres} et ${entierEnLettres(centimes)} centimes` : lettres;
}
