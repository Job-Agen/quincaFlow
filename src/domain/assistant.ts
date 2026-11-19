import { money, quantity, withUnit } from '../utils/format';

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
 * La réponse, écrite par l'application (§71).
 *
 * C'est le remplacement d'un modèle de langage par des phrases que nous
 * tenons. Elles sont moins souples — et elles ne mentent jamais, ne coûtent
 * rien, et répondent sans réseau sortant. Pour « combien j'ai vendu », c'est
 * un meilleur marché.
 */
export function formuler(outil: string, donnees: unknown, devise: string): string {
  const d = donnees as Record<string, unknown>;

  switch (outil) {
    case 'resume_boutique': {
      const lignes = [
        `Aujourd’hui : ${entier(d.nombre_de_ventes)} vente${Number(d.nombre_de_ventes) > 1 ? 's' : ''} pour ${money(d.ventes_du_jour, devise)}.`,
      ];
      if (d.marge_du_jour !== undefined) lignes.push(`Marge du jour : ${money(d.marge_du_jour, devise)}.`);
      if (Number(d.produits_en_alerte) > 0) {
        lignes.push(`${entier(d.produits_en_alerte)} produit(s) à racheter.`);
      }
      if (Number(d.dettes_clients) > 0) {
        // Un reste à encaisser n'a pas toujours un client en face : une vente
        // au comptoir laissée incomplète n'est rattachée à personne. Annoncer
        // « 0 client vous doit 2 900 » ne voudrait rien dire.
        lignes.push(
          Number(d.nombre_de_debiteurs) > 0
            ? `${entier(d.nombre_de_debiteurs)} client(s) vous doivent ${money(d.dettes_clients, devise)}.`
            : `Il reste ${money(d.dettes_clients, devise)} à encaisser sur des ventes.`
        );
      }
      if (Number(d.dettes_fournisseurs) > 0) {
        lignes.push(`Vous devez ${money(d.dettes_fournisseurs, devise)} à vos fournisseurs.`);
      }
      if (Number(d.charges_echues_ou_proches) > 0) {
        lignes.push(`${entier(d.charges_echues_ou_proches)} charge(s) à payer bientôt.`);
      }
      return lignes.join('\n');
    }

    case 'chercher_produit': {
      const trouves = (donnees as Record<string, unknown>[]) || [];
      if (trouves.length === 0) return 'Je ne trouve aucun produit qui porte ce nom.';
      return trouves
        .slice(0, 8)
        .map(
          (produit) =>
            `• ${produit.nom} : ${withUnit(Number(produit.stock), String(produit.unite))} en stock, ` +
            `à ${money(produit.prix_vente, devise)}`
        )
        .join('\n');
    }

    case 'stock_bas': {
      const bas = (donnees as Record<string, unknown>[]) || [];
      if (bas.length === 0) return 'Rien à racheter : aucun produit n’est sous son seuil.';
      return [
        'À racheter :',
        ...bas
          .slice(0, 10)
          .map(
            (produit) =>
              `• ${produit.nom} : ${withUnit(Number(produit.stock), String(produit.unite))} ` +
              `(seuil ${quantity(produit.seuil)})`
          ),
      ].join('\n');
    }

    case 'ventes_recentes': {
      const ventes = (donnees as Record<string, unknown>[]) || [];
      if (ventes.length === 0) return 'Aucune vente enregistrée pour l’instant.';
      return ventes
        .slice(0, 10)
        .map((vente) => {
          const reste = Number(vente.total) - Number(vente.paye);
          return (
            `• ${vente.reference} : ${money(vente.total, devise)}` +
            (vente.client ? ` — ${vente.client}` : '') +
            (reste > 0 ? ` — reste ${money(reste, devise)}` : '')
          );
        })
        .join('\n');
    }

    case 'rapport_financier': {
      const quand =
        d.periode === 'mois_dernier'
          ? 'Le mois dernier'
          : d.periode === '30j'
            ? 'Sur 30 jours'
            : d.periode === 'tout'
              ? 'Depuis le début'
              : 'Ce mois-ci';
      return [
        `${quand} : ${money(d.chiffre_affaires, devise)} de ventes.`,
        `Coût des marchandises : ${money(d.cout_des_marchandises, devise)}.`,
        `Marge brute : ${money(d.marge_brute, devise)}.`,
        Number(d.depenses_saisies) > 0
          ? `Charges déduites : ${money(d.charges_deduites, devise)}.`
          : 'Aucune dépense saisie : le bénéfice ci-dessous est votre marge brute.',
        `Bénéfice net : ${money(d.benefice_net, devise)}.`,
      ].join('\n');
    }

    case 'clients_endettes': {
      const clients = (d.clients as Record<string, unknown>[]) || [];
      if (clients.length === 0) return 'Personne ne vous doit rien. Toutes les ventes sont soldées.';
      return [
        `${entier(d.nombre_de_debiteurs)} client(s) vous doivent ${money(d.total_du, devise)} :`,
        ...clients
          .slice(0, 8)
          .map(
            (client) =>
              `• ${client.nom} : ${money(client.doit, devise)}` +
              (Number(client.depuis_jours) > 0 ? ` (depuis ${entier(client.depuis_jours)} jours)` : '')
          ),
      ].join('\n');
    }

    case 'charges_a_venir': {
      const charges = (donnees as Record<string, unknown>[]) || [];
      if (charges.length === 0) return 'Aucune charge enregistrée.';
      return charges
        .slice(0, 10)
        .map((charge) => {
          const jours = Number(charge.jours_restants);
          const quand =
            jours < 0 ? `en retard de ${-jours} jours` : jours === 0 ? 'à payer aujourd’hui' : `dans ${jours} jours`;
          return `• ${charge.libelle} : ${money(charge.montant, devise)}, ${quand}`;
        })
        .join('\n');
    }

    default:
      return '';
  }
}

/** Un entier lisible, sans décimale parasite. */
function entier(valeur: unknown): string {
  return quantity(Math.round(Number(valeur) || 0));
}
