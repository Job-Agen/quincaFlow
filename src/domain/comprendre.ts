/**
 * Comprendre une phrase de comptoir, sans rien envoyer dehors (§71).
 *
 * Un modèle de langage comprendrait davantage, mais il se paie à chaque
 * question et il faut un compte chez un fournisseur. Une quincaillerie n'a
 * pas à s'abonner pour savoir ce qu'il lui reste de ciment.
 *
 * Ce module fait donc le travail ici, en clair : il normalise la phrase,
 * cherche ce qu'elle demande, et en sort une intention. Il ne comprend pas
 * tout — et c'est pour cela qu'il **dit** quand il n'a pas compris, au lieu
 * de deviner. Une mauvaise devinette sur une vente coûte plus cher qu'un
 * « je n'ai pas compris ».
 */

/** Ce que la phrase demande, une fois comprise. */
export interface Intention {
  outil: string;
  /**
   * Les arguments tels que la phrase les donne. Les produits et les charges
   * y sont désignés par un **terme** — « ciment », « loyer » — que le serveur
   * résout en identifiant : seul lui connaît le catalogue de la boutique.
   */
  args: Record<string, unknown>;
}

/**
 * Met la phrase à plat : minuscules, sans accents, sans ponctuation inutile.
 *
 * Le gérant écrit au pouce, sur un téléphone de comptoir. « Combien j'ai
 * vendu ? », « combien jai vendu » et « COMBIEN J'AI VENDU » sont la même
 * question, et aucune règle ne doit s'écrire trois fois.
 */
export function aplatir(phrase: string): string {
  return (phrase || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'%,. -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les nombres écrits en lettres, jusqu'à vingt : « trois sacs ». */
const LETTRES: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  trente: 30,
  cinquante: 50,
  cent: 100,
  mille: 1000,
};

/**
 * Tous les nombres d'une phrase, dans l'ordre.
 *
 * « 10 000 » et « 10000 » sont le même montant : l'espace est un séparateur
 * de milliers, pas une frontière entre deux nombres. La virgule sépare les
 * décimales, comme on l'écrit ici — « 2,5 sacs ».
 */
export function nombres(phrase: string): number[] {
  const plat = aplatir(phrase);
  const trouves: number[] = [];

  // Les chiffres d'abord, espaces de milliers recousus.
  const chiffres = plat.replace(/(\d)[  ](?=\d{3}\b)/g, '$1');
  for (const brut of chiffres.match(/\d+(?:[.,]\d+)?/g) || []) {
    const valeur = Number(brut.replace(',', '.'));
    if (Number.isFinite(valeur)) trouves.push(valeur);
  }

  // Puis les lettres, seulement si aucun chiffre n'a été écrit : « trois sacs
  // à 2 500 » donne le prix en chiffres et la quantité en lettres, mais
  // mélanger les deux listes brouillerait leur ordre.
  if (trouves.length === 0) {
    for (const mot of plat.split(' ')) {
      const valeur = LETTRES[mot];
      if (valeur !== undefined) trouves.push(valeur);
    }
  }

  return trouves;
}

/** Les mots qui ne désignent jamais un produit : on les retire du terme. */
const VIDES = new Set([
  'de',
  'du',
  "d'",
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'au',
  'aux',
  'a',
  'en',
  'et',
  'pour',
  'sur',
  'dans',
  'il',
  'elle',
  'me',
  'moi',
  'je',
  "j'ai",
  'jai',
  'mon',
  'ma',
  'mes',
  'reste',
  'restent',
  'combien',
  'stock',
  'sacs',
  'sac',
  'pieces',
  'piece',
  'barres',
  'barre',
  'kg',
  'kilos',
  'kilo',
  'metres',
  'metre',
  'cartons',
  'carton',
  'litres',
  'litre',
  'unites',
  'unite',
  'paye',
  'payer',
  'paie',
  'regle',
  'client',
  'clients',
  // Les gens et les lieux ne sont pas des marchandises : « le fournisseur a
  // livré 15 sacs » cherchait « fournisseur sacs » au catalogue.
  'fournisseur',
  'fournisseurs',
  'boutique',
  'magasin',
  'depot',
  'camion',
  'livraison',
  'transporteur',
  'francs',
  'fcfa',
  'cfa',
  'f',
]);

/**
 * Le nom du produit ou de la charge dont parle la phrase.
 *
 * On retire les verbes, les nombres, les unités et les mots de liaison ; ce
 * qui reste est ce que le gérant a voulu nommer. Rend une chaîne vide quand
 * il n'a rien nommé — l'appelant demandera.
 */
export function terme(phrase: string, verbes: RegExp): string {
  // On filtre sur la forme à plat, mais on rend les mots **tels qu'écrits** :
  // le libellé d'une dépense finit sous les yeux du gérant, et « facture
  // CEET » vaut mieux que « facture ceet ».
  const motif = new RegExp(verbes.source, verbes.flags.replace('g', ''));
  return (phrase || '')
    .split(/\s+/)
    .map((mot) => ({
      brut: mot.replace(/^[,.;:!?'"«»]+|[,.;:!?'"«»]+$/g, ''),
      plat: aplatir(mot).replace(/^[,.]+|[,.]+$/g, ''),
    }))
    .filter(
      ({ brut, plat }) =>
        brut &&
        plat &&
        !VIDES.has(plat) &&
        LETTRES[plat] === undefined &&
        !/^\d+(?:[.,]\d+)?$/.test(plat) &&
        !motif.test(plat)
    )
    .map(({ brut }) => brut)
    .join(' ')
    .trim();
}

/*
 * Les mots se reconnaissent à leur **racine**, pas à leur forme entière.
 *
 * « racheté », « racheter », « rachat » : un gérant écrit celle qui lui vient,
 * et une règle calée sur « racheter » les manque toutes les deux autres. C'est
 * la faute qui a fait répondre « je n'ai pas compris » à « quels sont les
 * produits à racheté ».
 */
const VERBES_VENTE = /\b(vend\w*|sors|sort\w*|donne\w*|cede\w*)\b/g;
const VERBES_STOCK =
  /\b(ajout\w*|rajout\w*|retir\w*|enlev\w*|recu\w*|recois|recept\w*|reappro\w*|approvision\w*|cass\w*|perd\w*|pert\w*|inventaire|corrig\w*|arriv\w*|livr\w*)\b/g;
const VERBES_CHARGE = /\b(pay\w*|regl\w*|vers\w*)\b/g;

/** Ce qui désigne une charge qui revient : loyer, salaire, échéance (§66). */
const CHARGE = /\b(echeanc\w*|charge\w*|loyer\w*|salaire\w*|prochain paiement)\b/;

/** Les postes de dépense, reconnus par les mots du métier. */
const POSTES: [RegExp, string][] = [
  [/\bloyer\w*\b/, 'RENT'],
  [/\b(electricite|courant|ceet|eau|tdE|facture d'eau|energie)\w*\b/, 'UTILITIES'],
  [/\b(salaire|paie du commis|employe|commis|apprenti)\w*\b/, 'SALARY'],
  [/\b(achat de stock|marchandise|reassort)\w*\b/, 'STOCK_PURCHASE'],
  [/\b(transport|taxi|moto|carburant|essence|camion)\w*\b/, 'TRANSPORT'],
];

/** Le montant qui suit « payé », quand la phrase en porte deux. */
function montantPaye(plat: string): number | null {
  const apres = plat.match(/\b(?:a )?(?:paye|payee|paie|regle|verse|donne)\w*\s*:?\s*(\d[\d ]*)/);
  if (!apres || !apres[1]) return null;
  const valeur = Number(apres[1].replace(/[  ]/g, ''));
  return Number.isFinite(valeur) ? valeur : null;
}

/** Un produit déclaré en une phrase : « nouveau produit ciment achat 3900 vente 4300 ». */
function produitNeuf(phrase: string, plat: string): Intention {
  // Un produit ne se crée pas à la devinette : il lui faut un nom, une unité
  // et deux prix. On les cherche nommément, et ce qui manque sera redemandé
  // plutôt qu'inventé.
  const etiquete = (motif: RegExp): number | null => {
    const trouve = plat.match(motif);
    if (!trouve || !trouve[1]) return null;
    const valeur = Number(trouve[1].replace(/[  ]/g, '').replace(',', '.'));
    return Number.isFinite(valeur) ? valeur : null;
  };
  return {
    outil: 'creer_produit',
    args: {
      terme: terme(
        plat,
        /\b(nouveau|nouvel|produit|article|cree|creer|ajoute|achat|vente|stock|unite)\w*\b/g
      ),
      prixAchat: etiquete(/\bachat\w*\s*:?\s*(\d[\d ]*(?:[.,]\d+)?)/),
      prixVente: etiquete(/\bvente\w*\s*:?\s*(\d[\d ]*(?:[.,]\d+)?)/),
      stock: etiquete(/\bstock\w*\s*:?\s*(\d[\d ]*(?:[.,]\d+)?)/),
      unite: (plat.match(/\bunite\s*:?\s*([a-z]+)/) || [])[1] || null,
    },
  };
}

/**
 * Ce que la phrase demande.
 *
 * L'ordre compte : les gestes qui écrivent sont cherchés **avant** les
 * questions, parce que « vends 3 sacs de ciment » contient « ciment » et
 * ressemblerait sinon à « il me reste combien de ciment ».
 *
 * Rend `null` quand rien ne correspond. C'est un résultat, pas un échec :
 * l'écran répondra qu'il n'a pas compris et dira ce qu'il sait faire.
 */
export function comprendre(phrase: string): Intention | null {
  const plat = aplatir(phrase);
  if (!plat) return null;
  const chiffres = nombres(plat);

  /*
   * Une question n'est pas un ordre.
   *
   * « Combien j'ai vendu aujourd'hui » porte le mot « vendu » : lue comme un
   * geste, elle proposerait d'enregistrer une vente au lieu d'en donner le
   * total. Les mots interrogatifs tranchent, et ils tranchent en faveur de
   * la lecture — c'est le sens où se tromper ne coûte rien.
   */
  const interroge = /\b(combien|quel|quelle|quels|quelles|qui|quand|pourquoi|est ce que|qu'est|c'est quoi)\b/.test(
    plat
  );

  // ───────────────────────── Les gestes ─────────────────────────

  // Un nouveau produit se déclare avec ses prix — « vente 4300 » y est une
  // étiquette, pas un ordre de vendre. Cette branche passe donc en premier.
  if (/\b(nouveau produit|nouvel article|nouveau article)\b/.test(plat)) {
    return produitNeuf(phrase, plat);
  }

  // « Les dernières ventes » porte le mot « ventes » sans rien vouloir
  // vendre : la tournure est sans ambiguïté, elle passe donc avant les gestes.
  if (/\b(dernieres ventes|derniere vente|historique|liste des ventes)\b/.test(plat)) {
    return { outil: 'ventes_recentes', args: { limite: chiffres[0] ?? 10 } };
  }

  if (!interroge && VERBES_VENTE.test(plat)) {
    VERBES_VENTE.lastIndex = 0;
    const quantite = chiffres[0] ?? null;
    const paye = montantPaye(plat);
    return {
      outil: 'enregistrer_vente',
      args: {
        terme: terme(phrase, VERBES_VENTE),
        quantite,
        // Deux nombres sans « payé » : le second est ce qu'on a reçu.
        montantPaye: paye ?? (chiffres.length > 1 ? (chiffres[1] ?? null) : null),
      },
    };
  }
  VERBES_VENTE.lastIndex = 0;

  if (!interroge && VERBES_STOCK.test(plat)) {
    VERBES_STOCK.lastIndex = 0;
    const retire = /\b(retir\w*|enlev\w*|cass\w*|perd\w*|pert\w*)\b/.test(plat);
    const quantite = chiffres[0] ?? null;
    const motif = /\b(cass\w*|perd\w*|pert\w*)\b/.test(plat)
      ? 'casse'
      : /\binventaire\b/.test(plat)
        ? 'inventaire'
        : 'réassort';
    return {
      outil: 'ajuster_stock',
      args: {
        terme: terme(phrase, VERBES_STOCK),
        quantite: quantite === null ? null : retire ? -Math.abs(quantite) : Math.abs(quantite),
        motif,
      },
    };
  }
  VERBES_STOCK.lastIndex = 0;

  // Payer une charge : seulement si la phrase nomme un paiement **et** une
  // charge connue du métier. « payé 10 000 » tout court est une dépense.
  if (!interroge && VERBES_CHARGE.test(plat) && CHARGE.test(plat)) {
    VERBES_CHARGE.lastIndex = 0;
    return {
      outil: 'payer_charge',
      args: { terme: terme(phrase, VERBES_CHARGE), montant: chiffres[0] ?? null },
    };
  }
  VERBES_CHARGE.lastIndex = 0;

  // « Acheter » est à double sens : « j'ai acheté des clous 2 000 » est une
  // dépense, « liste des produits à acheter » est une question. Le montant
  // tranche — on ne dépense pas sans somme.
  const depense =
    /\b(depens\w*|factur\w*|pay\w*|regl\w*)\b/.test(plat) ||
    (/\b(achet\w*|achat\w*)\b/.test(plat) && chiffres.length > 0);

  if (!interroge && depense) {
    const poste = POSTES.find(([motif]) => motif.test(plat));
    return {
      outil: 'enregistrer_depense',
      args: {
        poste: poste ? poste[1] : 'OTHER',
        libelle: terme(phrase, /\b(depens\w*|pay\w*|regl\w*|achet\w*|achat\w*)\b/g),
        montant: chiffres[0] ?? null,
      },
    };
  }

  if (!interroge && /\b(cree|creer|ajoute un produit)\b/.test(plat)) {
    return produitNeuf(phrase, plat);
  }

  // ───────────────────────── Les questions ─────────────────────────

  if (/\b(rachet\w*|rachat\w*|achet\w*|ruptur\w*|manqu\w*|alert\w*|epuis\w*|command\w*|stock bas)\b/.test(plat)) {
    return { outil: 'stock_bas', args: {} };
  }

  // Les charges avant les dettes : « quand je dois payer le loyer » parle
  // d'une échéance, pas d'un client qui me doit de l'argent. Le mot « dois »
  // les rapprocherait sans ce départage.
  if (CHARGE.test(plat)) {
    return { outil: 'charges_a_venir', args: {} };
  }

  if (/\b(doi\w*|dett\w*|endett\w*|ardois\w*|credit\w*|creanc\w*|impay\w*|redevab\w*)\b/.test(plat)) {
    return { outil: 'clients_endettes', args: {} };
  }

  if (/\b(benefic\w*|marg\w*|rentab\w*|rapport\w*|gagn\w*|resultat\w*|profit\w*)\b/.test(plat)) {
    const periode = /\bmois dernier\b/.test(plat)
      ? 'mois_dernier'
      : /\b(30|trente) jours?\b/.test(plat)
        ? '30j'
        : /\b(tout|total|depuis le debut|toujours)\b/.test(plat)
          ? 'tout'
          : 'mois';
    return { outil: 'rapport_financier', args: { periode } };
  }

  // « Il me reste combien de ciment » : une question sur un produit nommé.
  if (/\b(reste|restent|stock|combien|dispo|disponible)\w*\b/.test(plat)) {
    // On retire aussi le vocabulaire du bilan : « combien j'ai vendu
    // aujourd'hui » ne nomme aucun produit, et ce qui resterait — « vendu
    // aujourd'hui » — serait cherché au catalogue comme s'il en était un.
    const nomme = terme(
      plat,
      /\b(reste|restent|stock|combien|dispo|disponible|y a t il|il y a|vendu|vendue|vendus|vente|ventes|aujourd'hui|aujourdhui|ce jour|journee|chiffre|caisse|total|resume|bilan|gagne|argent|encaisse)\w*\b/g
    );
    // Un nom de produit fait au moins trois lettres : « combien il y a en
    // caisse aujourd'hui » ne laisse qu'un « y » une fois le vocabulaire du
    // bilan retiré, et le chercher au catalogue ne donnerait rien.
    if (nomme.length >= 3) return { outil: 'chercher_produit', args: { terme: nomme } };
  }

  if (
    /\b(aujourd'hui|aujourdhui|ce jour|journee|resume|bilan|ca va|comment va|point|situation|caisse|vendu|vente|ventes|chiffre)\w*\b/.test(
      plat
    )
  ) {
    return { outil: 'resume_boutique', args: {} };
  }

  return null;
}

/** Ce que l'assistant répond quand il n'a pas compris. */
export const AIDE = [
  'Je n’ai pas compris. Essayez par exemple :',
  '• « combien j’ai vendu aujourd’hui »',
  '• « il me reste combien de ciment »',
  '• « qu’est-ce que je dois racheter »',
  '• « qui me doit de l’argent »',
  '• « vends 3 sacs de ciment, il a payé 10000 »',
  '• « j’ai payé la facture CEET 18000 »',
].join('\n');
