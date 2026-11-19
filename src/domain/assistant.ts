/**
 * L'assistant de la boutique (§71).
 *
 * Un gérant au comptoir n'a pas le temps de traverser six écrans pour savoir
 * ce qu'il lui reste de ciment. Il veut demander. L'assistant répond, et
 * quand il faut écrire — une vente, une dépense, un réassort — il **propose**
 * et attend qu'on appuie.
 *
 * Ce module ne tient que le catalogue et les mots : ce que l'assistant sait
 * faire, et comment le dire. L'exécution vit côté serveur, où la session et
 * la boutique sont connues ; ici rien ne touche à la base, et c'est ce qui
 * rend ces règles vérifiables.
 */

/** Un outil que l'assistant peut appeler. */
export interface Outil {
  nom: string;
  description: string;
  /**
   * Un outil qui **écrit** ne s'exécute jamais dans la boucle du modèle : il
   * devient une proposition que le gérant valide. C'est la seule différence
   * qui compte, et elle est portée par le catalogue plutôt que par une liste
   * tenue ailleurs — une liste à part finirait par diverger.
   */
  ecrit: boolean;
  /**
   * Réservé au propriétaire, exactement comme la route qui fait le même
   * geste. Un vendeur peut vendre ; il ne lit pas les bénéfices et ne touche
   * pas au stock. L'assistant ne doit pas être la porte dérobée qui contourne
   * ce que les écrans refusent (§30).
   */
  proprietaire: boolean;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

/** Ce que l'assistant demande d'écrire, en attente de l'accord du gérant. */
export interface Proposition {
  outil: string;
  args: Record<string, unknown>;
  /** La phrase que le gérant lit avant d'appuyer. */
  resume: string;
}

const texte = (description: string) => ({ type: 'string', description });
const nombre = (description: string) => ({ type: 'number', description });

export const OUTILS: readonly Outil[] = [
  // ───────────────────────── Lecture ─────────────────────────
  {
    nom: 'resume_boutique',
    description:
      "Chiffres du jour : ventes encaissées, nombre de ventes, valeur du stock, produits en rupture, dettes clients. À utiliser pour « comment ça va aujourd'hui », « combien j'ai fait », « résume-moi la boutique ».",
    ecrit: false,
    proprietaire: false,
    schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    nom: 'chercher_produit',
    description:
      "Cherche des produits par nom ou référence et rend leur identifiant, leur stock, leur prix d'achat et de vente. À appeler AVANT toute vente ou tout ajustement de stock : les autres outils veulent l'identifiant, jamais le nom.",
    ecrit: false,
    proprietaire: false,
    schema: {
      type: 'object',
      properties: { terme: texte('Un morceau du nom ou de la référence, par exemple « ciment »') },
      required: ['terme'],
      additionalProperties: false,
    },
  },
  {
    nom: 'stock_bas',
    description:
      "Produits dont le stock est tombé au seuil d'alerte ou en dessous, du plus critique au moins critique. Pour « qu'est-ce que je dois racheter ».",
    ecrit: false,
    proprietaire: false,
    schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    nom: 'ventes_recentes',
    description: 'Les dernières ventes, avec leur montant, ce qui a été payé et le client.',
    ecrit: false,
    proprietaire: false,
    schema: {
      type: 'object',
      properties: { limite: nombre('Combien de ventes, de 1 à 50. 10 par défaut.') },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nom: 'rapport_financier',
    description:
      "Chiffre d'affaires, coût des marchandises vendues, marge brute, dépenses et bénéfice net sur une période.",
    ecrit: false,
    proprietaire: true,
    schema: {
      type: 'object',
      properties: {
        periode: {
          type: 'string',
          enum: ['mois', 'mois_dernier', '30j', 'tout'],
          description: 'La période à couvrir. « mois » par défaut.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nom: 'clients_endettes',
    description: 'Les clients qui doivent encore de l’argent, du plus endetté au moins endetté.',
    ecrit: false,
    proprietaire: false,
    schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    nom: 'charges_a_venir',
    description:
      'Les charges récurrentes — loyer, salaires, électricité — avec leur échéance et le nombre de jours qui restent.',
    ecrit: false,
    proprietaire: true,
    schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },

  // ───────────────────────── Écriture ─────────────────────────
  {
    nom: 'enregistrer_vente',
    description:
      'Enregistre une vente au comptoir. Cherchez d’abord les produits pour avoir leurs identifiants. Le stock baisse d’autant.',
    ecrit: true,
    proprietaire: false,
    schema: {
      type: 'object',
      properties: {
        lignes: {
          type: 'array',
          description: 'Les produits vendus.',
          items: {
            type: 'object',
            properties: {
              produitId: texte('L’identifiant rendu par chercher_produit'),
              quantite: nombre('Quantité vendue, dans l’unité de base du produit'),
            },
            required: ['produitId', 'quantite'],
            additionalProperties: false,
          },
        },
        montantPaye: nombre('Ce que le client a versé. 0 si tout est à crédit.'),
      },
      required: ['lignes', 'montantPaye'],
      additionalProperties: false,
    },
  },
  {
    nom: 'ajuster_stock',
    description:
      'Corrige le stock d’un produit : réassort, casse, inventaire. Donnez la quantité à ajouter (positive) ou à retirer (négative).',
    ecrit: true,
    proprietaire: true,
    schema: {
      type: 'object',
      properties: {
        produitId: texte('L’identifiant rendu par chercher_produit'),
        quantite: nombre('Positive pour ajouter au stock, négative pour en retirer'),
        motif: texte('Pourquoi : « réassort », « casse », « inventaire »…'),
      },
      required: ['produitId', 'quantite', 'motif'],
      additionalProperties: false,
    },
  },
  {
    nom: 'creer_produit',
    description:
      'Crée un produit au catalogue. La référence est attribuée par l’application : ne l’inventez pas.',
    ecrit: true,
    proprietaire: true,
    schema: {
      type: 'object',
      properties: {
        nom: texte('Le nom du produit, tel que le gérant le dit'),
        unite: texte('L’unité de base : sac, pièce, barre, kg, mètre…'),
        prixAchat: nombre('Ce que le produit coûte à l’achat'),
        prixVente: nombre('Le prix de vente à l’unité'),
        stock: nombre('Quantité en stock à la création. 0 si rien.'),
      },
      required: ['nom', 'unite', 'prixAchat', 'prixVente', 'stock'],
      additionalProperties: false,
    },
  },
  {
    nom: 'enregistrer_depense',
    description:
      'Note une dépense de la boutique. Le poste TRANSPORT ne couvre pas le transport des achats, qui est déjà dans le coût des marchandises (§69).',
    ecrit: true,
    proprietaire: true,
    schema: {
      type: 'object',
      properties: {
        poste: {
          type: 'string',
          enum: ['RENT', 'UTILITIES', 'SALARY', 'STOCK_PURCHASE', 'TRANSPORT', 'OTHER'],
          description:
            'RENT loyer, UTILITIES énergie et eau, SALARY salaires, STOCK_PURCHASE achat de stock, TRANSPORT transport hors achats, OTHER divers.',
        },
        libelle: texte('Ce que c’est, en clair : « Loyer novembre », « Facture CEET »'),
        montant: nombre('Le montant dépensé'),
      },
      required: ['poste', 'libelle', 'montant'],
      additionalProperties: false,
    },
  },
  {
    nom: 'payer_charge',
    description:
      'Enregistre le paiement d’une charge récurrente. La dépense est écrite et le décompte repart (§70). Appelez charges_a_venir d’abord pour avoir l’identifiant.',
    ecrit: true,
    proprietaire: true,
    schema: {
      type: 'object',
      properties: {
        chargeId: texte('L’identifiant rendu par charges_a_venir'),
        montant: nombre('Ce qui a été payé. Le montant habituel de la charge si on ne dit rien.'),
      },
      required: ['chargeId', 'montant'],
      additionalProperties: false,
    },
  },
];

/** Retrouve un outil du catalogue. Rend `null` pour un nom inconnu. */
export function outil(nom: unknown): Outil | null {
  return OUTILS.find((candidat) => candidat.nom === nom) ?? null;
}

/**
 * Les outils qu'on présente à ce gérant-là.
 *
 * Un vendeur ne voit pas les outils du propriétaire : les lui montrer le
 * ferait proposer des gestes que le serveur refuse ensuite, et l'assistant
 * passerait pour un menteur. Le refus reste en place côté serveur — ceci
 * n'est que la politesse de ne pas promettre.
 */
export function outilsPour(proprietaire: boolean): Outil[] {
  return OUTILS.filter((candidat) => proprietaire || !candidat.proprietaire);
}

/**
 * Nombre maximum d'allers-retours avec le modèle pour une seule question.
 *
 * Sans cette borne, un modèle qui boucle sur un outil qui échoue coûterait
 * indéfiniment l'argent du gérant. Six tours suffisent largement : chercher
 * un produit, lire un chiffre, répondre.
 */
export const MAX_TOURS = 6;

/**
 * Ce que l'assistant sait de son métier.
 *
 * Deux choses comptent ici, et elles sont écrites pour être lues par le
 * modèle, pas par un développeur : qu'il parle la langue du comptoir, et
 * qu'il ne prétende jamais avoir fait ce qu'il n'a que proposé.
 */
export function invite(contexte: {
  boutique: string;
  gerant: string;
  proprietaire: boolean;
  devise: string;
  jour: string;
}): string {
  return [
    `Tu es l'assistant de la quincaillerie « ${contexte.boutique} », dans l'application MaQuincaillerie.`,
    `Tu parles à ${contexte.gerant}, ${contexte.proprietaire ? 'le propriétaire' : 'un vendeur'} de la boutique. Nous sommes le ${contexte.jour}. La monnaie est le ${contexte.devise}.`,
    '',
    'Comment tu réponds :',
    '— En français simple, celui d’un commerçant togolais. Pas de jargon comptable.',
    '— Court. Deux ou trois phrases, ou une petite liste. Jamais de tableau.',
    '— Les montants en toutes lettres de chiffres, avec la monnaie : « 80 000 FCFA ».',
    '',
    'Ce que tu ne fais jamais :',
    '— Inventer un chiffre. Si tu ne l’as pas lu par un outil, tu dis que tu ne sais pas.',
    '— Dire qu’une vente, une dépense ou un réassort est enregistré. Toi, tu le **proposes** ;',
    '  c’est le gérant qui valide d’un appui, et l’application le lui annonce elle-même.',
    '— Supposer un identifiant. Cherche d’abord, écris ensuite.',
    '',
    'Quand une demande est ambiguë — un produit qui ressemble à trois autres, un montant',
    'qui manque —, pose une question courte au lieu de deviner.',
  ].join('\n');
}
