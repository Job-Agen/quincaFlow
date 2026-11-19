import { badRequest, forbidden } from '../lib/http';
import { num, str } from '../lib/validate';
import { formuler, outil, type Proposition } from '../domain/assistant';
import { AIDE, comprendre, completer, terme } from '../domain/comprendre';
import { decompte, phraseEcheance } from '../domain/charge';
import { EXPENSE_CATEGORY_LABELS } from '../domain/report';
import { amount, money, withUnit } from '../utils/format';
import { round2, round3 } from '../utils/money';
import { dashboard } from './dashboard';
import { listProducts, lowStockProducts, getProduct, createProduct, adjustStock } from './products';
import { createSale, listSales } from './sales';
import { financialReport } from './reports';
import { periodBounds } from './history';
import { debtors } from './credit';
import { listCharges, getCharge, payCharge } from './charges';
import { createExpense } from './expenses';
import { profile } from './accounts';
import type { Session } from '@/types';

/**
 * L'assistant de la boutique (§71).
 *
 * Il comprend la phrase **ici**, sur le serveur de la boutique, sans rien
 * envoyer dehors : pas de clé d'API, pas d'abonnement, pas un franc par
 * question. Un modèle de langage comprendrait davantage ; il se paierait à
 * chaque « il me reste combien de ciment », et ce n'est pas un marché qu'une
 * quincaillerie a à faire.
 *
 * Tout ce que l'assistant fait passe par les **fonctions de service déjà
 * écrites**, jamais par du SQL à lui. Ce n'est pas de la paresse : ces
 * fonctions portent déjà l'isolation entre boutiques (§29), les contrôles de
 * rôle et les règles métier. Un assistant qui parlerait directement à
 * Postgres les réinventerait, et finirait un jour par vendre le stock d'une
 * autre quincaillerie.
 *
 * Deuxième règle, celle que le gérant a demandée : **rien ne s'écrit sans un
 * appui**. Les outils d'écriture ne s'exécutent jamais tout seuls ; ils
 * deviennent une proposition, que l'écran montre et que le gérant valide. Un
 * mot mal compris ne coûte alors rien.
 */

/** Aujourd'hui en `YYYY-MM-DD`, comme la base range les dates. */
function jour(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Les outils de lecture
// ---------------------------------------------------------------------------

/**
 * Exécute un outil de lecture et rend de quoi répondre.
 *
 * Ce qui remonte est volontairement maigre : le modèle n'a pas besoin de
 * trente colonnes pour dire qu'il reste douze sacs, et chaque champ inutile
 * est payé par le gérant à chaque question.
 */
export async function lire(
  session: Session,
  nom: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const proprietaire = session.role === 'OWNER';

  switch (nom) {
    case 'resume_boutique': {
      const vue = await dashboard(session.businessId, proprietaire);
      return {
        ventes_du_jour: vue.revenue,
        nombre_de_ventes: vue.salesCount,
        marge_du_jour: proprietaire ? vue.margin : undefined,
        produits_en_alerte: vue.lowStockCount,
        ruptures_vendues: vue.outOfStockCount,
        dettes_clients: vue.receivables,
        nombre_de_debiteurs: vue.debtorCount,
        dettes_fournisseurs: vue.supplierDebt,
        charges_echues_ou_proches: vue.chargesDues.length,
      };
    }

    case 'chercher_produit': {
      const terme = str(args.terme, 'terme', { max: 80 });
      const trouves = await listProducts(session.businessId, { search: terme, limit: 12 });
      return trouves.map((produit) => ({
        id: produit.id,
        nom: produit.name,
        reference: produit.sku,
        unite: produit.base_unit,
        stock: produit.stock_quantity,
        prix_vente: produit.selling_price,
        prix_achat: proprietaire ? produit.purchase_price : undefined,
      }));
    }

    case 'stock_bas': {
      const bas = await lowStockProducts(session.businessId, 15);
      return bas.map((produit) => ({
        id: produit.id,
        nom: produit.name,
        unite: produit.base_unit,
        stock: produit.stock_quantity,
        seuil: produit.low_stock_threshold,
      }));
    }

    case 'ventes_recentes': {
      const limite = Math.min(50, Math.max(1, Math.round(Number(args.limite) || 10)));
      const ventes = await listSales(session.businessId, { limit: limite });
      return ventes.map((vente) => ({
        reference: vente.reference,
        total: vente.total,
        paye: vente.amount_paid,
        client: vente.customer_name,
        date: vente.created_at,
      }));
    }

    case 'rapport_financier': {
      const demandee = String(args.periode || 'mois');
      const periode =
        demandee === 'mois_dernier'
          ? 'last-month'
          : demandee === '30j'
            ? '30d'
            : demandee === 'tout'
              ? null
              : 'month';
      const rapport = await financialReport(session.businessId, periodBounds(periode));
      const totaux = rapport.totals;
      return {
        periode: demandee,
        chiffre_affaires: totaux.revenue,
        cout_des_marchandises: totaux.costOfGoods,
        marge_brute: totaux.grossMargin,
        charges_deduites: totaux.operatingExpenses,
        benefice_net: totaux.netProfit,
        nombre_de_ventes: rapport.salesCount,
        depenses_saisies: rapport.expenseCount,
      };
    }

    case 'clients_endettes': {
      const ardoise = await debtors(session.businessId, 10);
      return {
        total_du: ardoise.totalOwed,
        nombre_de_debiteurs: ardoise.debtorCount,
        clients: ardoise.debtors.map((debiteur) => ({
          nom: debiteur.name,
          telephone: debiteur.phone,
          doit: debiteur.owed,
          depuis_jours: debiteur.oldestDays,
        })),
      };
    }

    case 'charges_a_venir': {
      const charges = await listCharges(session.businessId);
      const aujourdhui = jour();
      return charges.map((charge) => ({
        id: charge.id,
        libelle: charge.label,
        montant: charge.amount,
        tous_les_mois: charge.interval_months,
        echeance: charge.next_due_on,
        jours_restants: decompte(charge, aujourdhui).jours,
      }));
    }

    default:
      throw badRequest(`Outil de lecture inconnu : ${nom}.`);
  }
}

// ---------------------------------------------------------------------------
// Les outils d'écriture : décrire, puis exécuter
// ---------------------------------------------------------------------------

/**
 * La phrase que le gérant lit avant d'appuyer.
 *
 * Elle est construite **depuis la base**, pas depuis ce que le modèle
 * raconte : les noms, les prix et les stocks sont relus par identifiant. Un
 * modèle qui se tromperait de produit se trahit alors dans la phrase, au lieu
 * de la maquiller.
 */
export async function decrire(
  session: Session,
  nom: string,
  args: Record<string, unknown>,
  devise: string
): Promise<string> {
  switch (nom) {
    case 'enregistrer_vente': {
      const lignes = Array.isArray(args.lignes) ? args.lignes : [];
      const details: string[] = [];
      let total = 0;
      for (const brute of lignes as Record<string, unknown>[]) {
        const produit = await getProduct(session.businessId, str(brute.produitId, 'produit'));
        const quantite = round3(num(brute.quantite, 'quantité', { min: 0 }));
        const ligne = round2(quantite * produit.selling_price);
        total = round2(total + ligne);
        details.push(
          `${withUnit(quantite, produit.base_unit)} de ${produit.name} à ${amount(
            produit.selling_price
          )} = ${money(ligne, devise)}`
        );
      }
      const paye = round2(num(args.montantPaye, 'montant payé', { min: 0, required: false }));
      const reste = round2(total - paye);
      return [
        `Enregistrer une vente de ${money(total, devise)} :`,
        ...details.map((detail) => `• ${detail}`),
        `Payé : ${money(paye, devise)}${reste > 0 ? ` — reste à devoir ${money(reste, devise)}` : ''}`,
        'Le stock baissera d’autant.',
      ].join('\n');
    }

    case 'ajuster_stock': {
      const produit = await getProduct(session.businessId, str(args.produitId, 'produit'));
      const delta = round3(num(args.quantite, 'quantité', { min: -1e9 }));
      const apres = round3(produit.stock_quantity + delta);
      return [
        `${delta >= 0 ? 'Ajouter' : 'Retirer'} ${withUnit(Math.abs(delta), produit.base_unit)} ` +
          `${delta >= 0 ? 'au' : 'du'} stock de ${produit.name}.`,
        `Stock : ${withUnit(produit.stock_quantity, produit.base_unit)} → ${withUnit(apres, produit.base_unit)}.`,
        `Motif : ${str(args.motif, 'motif', { max: 200 })}`,
      ].join('\n');
    }

    case 'creer_produit':
      return [
        `Créer le produit « ${str(args.nom, 'nom', { max: 120 })} ».`,
        `Unité : ${str(args.unite, 'unité', { max: 40 })}`,
        `Prix d’achat : ${money(num(args.prixAchat, 'prix d’achat', { min: 0 }), devise)} — ` +
          `prix de vente : ${money(num(args.prixVente, 'prix de vente', { min: 0 }), devise)}`,
        `Stock de départ : ${num(args.stock, 'stock', { min: 0, required: false })}`,
        'La référence sera attribuée par l’application.',
      ].join('\n');

    case 'enregistrer_depense': {
      const poste = String(args.poste || 'OTHER') as keyof typeof EXPENSE_CATEGORY_LABELS;
      return [
        `Noter une dépense de ${money(num(args.montant, 'montant', { min: 0 }), devise)}.`,
        `Poste : ${EXPENSE_CATEGORY_LABELS[poste] || 'Divers'}`,
        `Libellé : ${str(args.libelle, 'libellé', { max: 160 })}`,
      ].join('\n');
    }

    case 'payer_charge': {
      const charge = await getCharge(session.businessId, str(args.chargeId, 'charge'));
      const montant = round2(
        num(args.montant, 'montant', { min: 0, required: false }) || charge.amount
      );
      return [
        `Enregistrer le paiement de « ${charge.label} » : ${money(montant, devise)}.`,
        `Échéance actuelle : ${phraseEcheance(charge.next_due_on, jour()).toLowerCase()}.`,
        'Une dépense sera écrite et le décompte repartira de ce jour.',
      ].join('\n');
    }

    default:
      throw badRequest(`Outil d’écriture inconnu : ${nom}.`);
  }
}

/**
 * Exécute une proposition que le gérant vient de valider.
 *
 * Les droits sont revérifiés ici, et pas seulement à l'affichage : un écran
 * qui cache un bouton n'est pas une serrure (§30). Les arguments viennent du
 * client, mais ils ne donnent aucun pouvoir nouveau — ce sont les mêmes
 * fonctions, la même session, les mêmes refus que les écrans ordinaires.
 */
export async function executer(
  session: Session,
  nom: string,
  args: Record<string, unknown>
): Promise<string> {
  const defini = outil(nom);
  if (!defini) throw badRequest('Cette action n’existe pas.');
  // Un outil de lecture n'a rien à faire ici. Le `switch` ne lui répondrait
  // pas non plus, mais il vaut mieux refuser à la porte, et le dire
  // autrement : « n'existe pas » et « ne s'écrit pas » ne sont pas la même
  // faute, et le jour où quelqu'un ajoutera un cas au `switch` sans toucher
  // au catalogue, c'est cette ligne-là qui tiendra.
  if (!defini.ecrit) throw badRequest('Cette action ne s’écrit pas.');
  if (defini.proprietaire && session.role !== 'OWNER') {
    throw forbidden('Réservé au propriétaire.');
  }

  switch (nom) {
    case 'enregistrer_vente': {
      const lignes = (Array.isArray(args.lignes) ? args.lignes : []) as Record<string, unknown>[];
      const vente = await createSale(session, {
        lines: lignes.map((ligne) => ({
          productId: ligne.produitId,
          quantity: ligne.quantite,
        })),
        amountPaid: args.montantPaye,
      });
      return `Vente ${vente.reference} enregistrée.`;
    }

    case 'ajuster_stock': {
      const produit = await getProduct(session.businessId, str(args.produitId, 'produit'));
      const delta = round3(num(args.quantite, 'quantité', { min: -1e9 }));
      // `adjustStock` raisonne en stock **compté**, pas en écart : c'est ce
      // qu'on saisit à l'inventaire. L'assistant, lui, parle d'un mouvement.
      const apres = await adjustStock(session, produit.id, {
        stockQuantity: round3(produit.stock_quantity + delta),
        reason: str(args.motif, 'motif', { max: 200 }),
      });
      return `Stock de ${apres.name} : ${withUnit(apres.stock_quantity, apres.base_unit)}.`;
    }

    case 'creer_produit': {
      const produit = await createProduct(session, {
        name: args.nom,
        baseUnit: args.unite,
        purchasePrice: args.prixAchat,
        sellingPrice: args.prixVente,
        stockQuantity: args.stock,
        units: [],
      });
      return `${produit.name} créé, référence ${produit.sku}.`;
    }

    case 'enregistrer_depense': {
      const depense = await createExpense(session, {
        category: args.poste,
        label: args.libelle,
        amount: args.montant,
      });
      return `Dépense « ${depense.label} » enregistrée.`;
    }

    case 'payer_charge': {
      const charge = await payCharge(session, str(args.chargeId, 'charge'), {
        amount: args.montant,
      });
      return `« ${charge.label} » payée. Prochaine échéance le ${charge.next_due_on}.`;
    }

    default:
      throw badRequest('Cette action n’existe pas.');
  }
}

// ---------------------------------------------------------------------------
// La conversation
// ---------------------------------------------------------------------------

export interface Tour {
  role: 'user' | 'assistant';
  texte: string;
}

export interface Reponse {
  texte: string;
  proposition: Proposition | null;
}

/**
 * Le sujet en cours, retrouvé dans le fil (§71).
 *
 * Rien n'est gardé entre deux requêtes : le fil arrive entier à chaque
 * question, et la mémoire se **relit** plutôt qu'elle ne se stocke. C'est ce
 * qui la rend sans danger — elle ne contient que ce que le gérant a écrit, et
 * elle ne donne aucun pouvoir qu'une phrase complète ne donnerait.
 *
 * On ne remonte que deux tours : au-delà, poursuivre une question oubliée
 * depuis longtemps surprendrait plus qu'elle n'aiderait.
 */
function poursuite(tours: Tour[]): ReturnType<typeof comprendre> {
  const dits = tours.filter((tour) => tour.role === 'user' && tour.texte.trim());
  const derniere = dits[dits.length - 1];
  if (!derniere) return null;

  for (const tour of dits.slice(-3, -1).reverse()) {
    const precedente = comprendre(tour.texte);
    if (precedente) return completer(precedente, derniere.texte);
  }
  return null;
}

/**
 * Quand aucune tournure n'est reconnue, chercher quand même (§71).
 *
 * Une phrase qu'on n'a pas su lire nomme souvent un produit : « ciment ? »,
 * « et les tôles ». Plutôt que de répondre « je n'ai pas compris » à quelqu'un
 * qui a posé une vraie question, on cherche ses mots au catalogue. Un filet
 * ne remplace pas une règle, mais il rattrape ce que les règles n'ont pas
 * prévu — et il ne peut rien casser, puisqu'il ne fait que lire.
 */
async function dernierRecours(
  session: Session,
  phrase: string,
  devise: string
): Promise<string> {
  // `terme` retire les mots de liaison, les nombres et les unités ; ce qui
  // reste est ce que le gérant a nommé.
  const mots = terme(phrase, /^$/).trim();
  if (mots.length >= 3) {
    for (const essai of [mots, ...mots.split(' ').filter((mot) => mot.length >= 4)]) {
      const trouves = await listProducts(session.businessId, { search: essai, limit: 8 });
      if (trouves.length > 0) {
        return formuler(
          'chercher_produit',
          trouves.map((produit) => ({
            nom: produit.name,
            unite: produit.base_unit,
            stock: produit.stock_quantity,
            prix_vente: produit.selling_price,
          })),
          devise
        );
      }
    }
  }
  return AIDE;
}

/**
 * Retrouve le produit dont parle la phrase.
 *
 * Trois issues, et c'est leur distinction qui fait la qualité de l'assistant :
 * on a trouvé, on n'a rien trouvé, ou il y en a plusieurs. Le troisième cas
 * est le piège : choisir au hasard entre « Ciment 32,5 » et « Ciment 42,5 »
 * vendrait un jour le mauvais sac.
 */
async function resoudreProduit(
  session: Session,
  terme: unknown
): Promise<{ produit: Awaited<ReturnType<typeof getProduct>> } | { question: string }> {
  const cherche = String(terme || '').trim();
  if (!cherche) return { question: 'De quel produit parlez-vous ?' };

  const trouves = await listProducts(session.businessId, { search: cherche, limit: 8 });
  if (trouves.length === 0) {
    return { question: `Je ne trouve aucun produit qui ressemble à « ${cherche} ».` };
  }
  const exact = trouves.find((candidat) => candidat.name.toLowerCase() === cherche.toLowerCase());
  const choisi = exact ?? (trouves.length === 1 ? trouves[0] : null);
  if (!choisi) {
    return {
      question: [
        'Lequel ?',
        ...trouves.slice(0, 6).map((candidat) => `• ${candidat.name}`),
        'Reprenez avec son nom complet.',
      ].join('\n'),
    };
  }
  return { produit: await getProduct(session.businessId, choisi.id) };
}

/**
 * Une question du gérant, une réponse.
 *
 * Les lectures s'exécutent tout de suite ; les écritures sortent en
 * proposition. Entre les deux, rien : l'assistant n'a aucun pouvoir propre,
 * il n'a que ceux de la session qui lui parle.
 */
export async function repondre(session: Session, tours: Tour[]): Promise<Reponse> {
  const derniere = [...tours].reverse().find((tour) => tour.role === 'user' && tour.texte.trim());
  if (!derniere) throw badRequest('Dites quelque chose à l’assistant.');

  const { business } = await profile(session);
  const devise = business.currency || 'FCFA';
  const proprietaire = session.role === 'OWNER';

  const intention = comprendre(derniere.texte) ?? poursuite(tours);
  if (!intention) {
    return { texte: await dernierRecours(session, derniere.texte, devise), proposition: null };
  }

  const defini = outil(intention.outil);
  if (!defini) return { texte: AIDE, proposition: null };
  if (defini.proprietaire && !proprietaire) {
    return {
      texte: 'Cette question est réservée au propriétaire de la boutique.',
      proposition: null,
    };
  }

  // ───────────────────────── Les questions ─────────────────────────
  if (!defini.ecrit) {
    const donnees = await lire(session, defini.nom, intention.args);
    return { texte: formuler(defini.nom, donnees, devise), proposition: null };
  }

  // ───────────────────────── Les gestes ─────────────────────────
  const args: Record<string, unknown> = {};

  if (defini.nom === 'enregistrer_vente') {
    const resolu = await resoudreProduit(session, intention.args.terme);
    if ('question' in resolu) return { texte: resolu.question, proposition: null };
    const quantite = Number(intention.args.quantite);
    if (!Number.isFinite(quantite) || quantite <= 0) {
      return { texte: `Combien de ${resolu.produit.name} ?`, proposition: null };
    }
    const total = round2(quantite * resolu.produit.selling_price);
    args.lignes = [{ produitId: resolu.produit.id, quantite }];
    // Rien de dit sur le paiement : on suppose payé comptant, le cas du
    // comptoir. La supposition est écrite sur la carte, où le gérant la voit
    // avant d'appuyer — c'est ce qui la rend sans danger.
    //
    // L'absence se teste sur la valeur, pas sur `Number()` : `Number(null)`
    // vaut zéro, un zéro parfaitement fini qui faisait enregistrer « payé 0 »
    // toute vente dont la phrase ne parlait pas d'argent.
    const declare =
      intention.args.montantPaye === null || intention.args.montantPaye === undefined
        ? null
        : Number(intention.args.montantPaye);
    args.montantPaye = declare !== null && Number.isFinite(declare) ? declare : total;
  } else if (defini.nom === 'ajuster_stock') {
    const resolu = await resoudreProduit(session, intention.args.terme);
    if ('question' in resolu) return { texte: resolu.question, proposition: null };
    const quantite = Number(intention.args.quantite);
    if (!Number.isFinite(quantite) || quantite === 0) {
      return { texte: `Combien de ${resolu.produit.name} ajouter ou retirer ?`, proposition: null };
    }
    args.produitId = resolu.produit.id;
    args.quantite = quantite;
    args.motif = String(intention.args.motif || 'correction');
  } else if (defini.nom === 'enregistrer_depense') {
    const montant = Number(intention.args.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      return { texte: 'Quel montant avez-vous dépensé ?', proposition: null };
    }
    const poste = String(intention.args.poste || 'OTHER');
    args.poste = poste;
    args.montant = montant;
    args.libelle =
      String(intention.args.libelle || '').trim() ||
      EXPENSE_CATEGORY_LABELS[poste as keyof typeof EXPENSE_CATEGORY_LABELS] ||
      'Dépense';
  } else if (defini.nom === 'payer_charge') {
    const cherche = String(intention.args.terme || '').trim();
    const charges = await listCharges(session.businessId);
    const trouvees = charges.filter((charge) =>
      cherche ? charge.label.toLowerCase().includes(cherche.toLowerCase()) : false
    );
    if (trouvees.length !== 1 || !trouvees[0]) {
      if (charges.length === 0) return { texte: 'Vous n’avez aucune charge enregistrée.', proposition: null };
      return {
        texte: ['Laquelle ?', ...charges.slice(0, 8).map((charge) => `• ${charge.label}`)].join('\n'),
        proposition: null,
      };
    }
    args.chargeId = trouvees[0].id;
    const montant = Number(intention.args.montant);
    args.montant = Number.isFinite(montant) && montant > 0 ? montant : trouvees[0].amount;
  } else if (defini.nom === 'creer_produit') {
    const nom = String(intention.args.terme || '').trim();
    const manque: string[] = [];
    if (!nom) manque.push('son nom');
    const prixAchat = Number(intention.args.prixAchat);
    const prixVente = Number(intention.args.prixVente);
    if (!Number.isFinite(prixAchat)) manque.push('le prix d’achat');
    if (!Number.isFinite(prixVente)) manque.push('le prix de vente');
    if (manque.length > 0) {
      return {
        texte: [
          `Pour créer un produit il me manque ${manque.join(' et ')}.`,
          'Dites par exemple : « nouveau produit ciment 50 kg, achat 3900, vente 4300, stock 40 ».',
        ].join('\n'),
        proposition: null,
      };
    }
    args.nom = nom;
    args.unite = String(intention.args.unite || 'pièce');
    args.prixAchat = prixAchat;
    args.prixVente = prixVente;
    const stock = Number(intention.args.stock);
    args.stock = Number.isFinite(stock) ? stock : 0;
  } else {
    return { texte: AIDE, proposition: null };
  }

  return {
    texte: '',
    proposition: {
      outil: defini.nom,
      args,
      resume: await decrire(session, defini.nom, args, devise),
    },
  };
}
