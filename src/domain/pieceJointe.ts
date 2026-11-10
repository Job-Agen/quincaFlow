/**
 * Ce qu'une commande accepte comme pièce jointe (§59).
 *
 * Les règles vivent ici, en un seul endroit, parce qu'elles servent deux fois :
 * l'écran s'en sert pour refuser tout de suite, avec une phrase utile et sans
 * faire monter trois mégaoctets pour rien ; le serveur s'en sert pour refuser
 * vraiment, parce qu'il ne fait jamais confiance au client (§35).
 */

/**
 * Les types acceptés, et comment ils se montrent.
 *
 * `enLigne` dit si le navigateur peut l'afficher sans danger dans notre propre
 * domaine. Tout le reste se télécharge : un fichier servi depuis notre domaine
 * avec son propre type exécuterait son contenu chez nous. C'est pourquoi le SVG
 * et le HTML n'y sont pas — ce sont des documents qui portent du script, et un
 * fournisseur n'envoie pas sa facture en SVG.
 */
export const TYPES_ACCEPTES: Record<string, { libelle: string; ext: string; enLigne: boolean }> = {
  'application/pdf': { libelle: 'PDF', ext: 'pdf', enLigne: true },
  'image/jpeg': { libelle: 'Photo JPEG', ext: 'jpg', enLigne: true },
  'image/png': { libelle: 'Image PNG', ext: 'png', enLigne: true },
  'image/webp': { libelle: 'Image WebP', ext: 'webp', enLigne: true },
  'image/heic': { libelle: 'Photo HEIC', ext: 'heic', enLigne: false },
  'image/heif': { libelle: 'Photo HEIF', ext: 'heif', enLigne: false },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    libelle: 'Word',
    ext: 'docx',
    enLigne: false,
  },
  'application/msword': { libelle: 'Word', ext: 'doc', enLigne: false },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    libelle: 'Excel',
    ext: 'xlsx',
    enLigne: false,
  },
  'application/vnd.ms-excel': { libelle: 'Excel', ext: 'xls', enLigne: false },
  'text/csv': { libelle: 'CSV', ext: 'csv', enLigne: false },
  'text/plain': { libelle: 'Texte', ext: 'txt', enLigne: false },
};

/**
 * Poids maximal du fichier d'origine, avant encodage.
 *
 * Deux bornes se superposent. Celle de l'hébergeur d'abord : une requête ne
 * peut pas dépasser 4,5 Mo, et le base64 gonfle de moitié environ — 2,5 Mo de
 * fichier font 3,4 Mo encodés, ce qui passe. Celle de la base ensuite : les
 * pièces vivent dans Postgres comme le justificatif de dépense (§40), et une
 * facture scannée sans borne y tiendrait la place de mille ventes.
 *
 * Une photo prise au comptoir est réduite avant l'envoi et pèse deux cents
 * kilo-octets : cette borne ne la concerne pas. Elle vise le PDF de vingt
 * pages que le fournisseur envoie une fois l'an.
 */
export const MAX_OCTETS = 2_500_000;

/** La même borne, mais sur la chaîne encodée, telle que le serveur la reçoit. */
export const MAX_ENCODE = Math.ceil((MAX_OCTETS * 4) / 3) + 200;

/** « 1,2 Mo », « 340 Ko » — jamais « 1258291 octets ». */
export function poidsLisible(octets: number): string {
  if (octets < 1000) return `${octets} o`;
  if (octets < 1_000_000) return `${Math.round(octets / 1000)} Ko`;
  return `${(octets / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Lit l'en-tête d'une `data:` URL sans décoder tout le reste.
 *
 * Rend le type déclaré et le poids réel du fichier d'origine. Le poids se
 * déduit de la longueur du base64 — quatre caractères pour trois octets, moins
 * le remplissage final — plutôt que de décoder deux mégaoctets en mémoire pour
 * les compter.
 */
export function entete(contenu: string): { mime: string; octets: number } | null {
  const coupe = contenu.indexOf(',');
  if (coupe < 0) return null;
  const tete = contenu.slice(0, coupe);
  const correspondance = /^data:([a-z0-9.+/-]+);base64$/i.exec(tete);
  if (!correspondance || !correspondance[1]) return null;

  const corps = contenu.slice(coupe + 1);
  if (!corps) return null;
  const remplissage = corps.endsWith('==') ? 2 : corps.endsWith('=') ? 1 : 0;
  return { mime: correspondance[1].toLowerCase(), octets: (corps.length * 3) / 4 - remplissage };
}

/**
 * Pourquoi ce fichier ne peut pas être joint, ou `null` s'il le peut.
 *
 * Rend la phrase, pas un code : c'est elle que le gérant lira, et elle doit
 * dire quoi faire plutôt que ce qui s'est mal passé.
 */
export function refus(contenu: string): string | null {
  const lu = entete(contenu);
  if (!lu) return "Ce fichier n'a pas pu être lu. Choisissez-en un autre.";
  if (!TYPES_ACCEPTES[lu.mime]) {
    return 'Format non accepté. Joignez un PDF, une photo, un document Word ou Excel.';
  }
  if (lu.octets > MAX_OCTETS) {
    return `Fichier trop lourd (${poidsLisible(lu.octets)}). Maximum ${poidsLisible(MAX_OCTETS)}.`;
  }
  return null;
}

/**
 * Le nom sous lequel le fichier se téléchargera.
 *
 * Le nom saisi est nettoyé de ce qui ferait un chemin — un fichier nommé
 * `../../facture` ne doit pas pouvoir sortir d'un dossier à l'arrivée — et il
 * reçoit l'extension de son type s'il n'en a aucune, sans quoi le téléphone ne
 * saurait pas avec quoi l'ouvrir.
 */
export function nomDeFichier(nom: string, mime: string): string {
  const propre = nom.replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'document';
  const type = TYPES_ACCEPTES[mime];
  if (!type) return propre;
  return propre.toLowerCase().endsWith(`.${type.ext}`) ? propre : `${propre}.${type.ext}`;
}
