import Anthropic from '@anthropic-ai/sdk';
import { badRequest, forbidden } from '../lib/http';
import { num, str } from '../lib/validate';
import { MAX_TOURS, invite, outil, outilsPour, type Proposition } from '../domain/assistant';
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
 * Tout ce que l'assistant fait passe par les **fonctions de service déjà
 * écrites**, jamais par du SQL à lui. Ce n'est pas de la paresse : ces
 * fonctions portent déjà l'isolation entre boutiques (§29), les contrôles de
 * rôle et les règles métier. Un assistant qui parlerait directement à
 * Postgres les réinventerait, et finirait un jour par vendre le stock d'une
 * autre quincaillerie.
 *
 * Deuxième règle, celle que le gérant a demandée : **rien ne s'écrit sans un
 * appui**. Les outils d'écriture ne s'exécutent jamais dans la boucle du
 * modèle ; ils en sortent sous forme de proposition, que l'écran montre et
 * que le gérant valide. Un mot mal compris ne coûte alors rien.
 */

/**
 * Le modèle. Changeable par variable d'environnement, parce que le coût de
 * chaque message est payé par le gérant et que c'est à lui d'arbitrer entre
 * finesse et dépense.
 */
const MODELE = process.env.ASSISTANT_MODEL || 'claude-opus-5-5';

/**
 * Les réponses sont courtes par construction — deux ou trois phrases au
 * comptoir. Un plafond bas borne la dépense sans jamais tronquer, puisque
 * l'invite demande la brièveté.
 */
const MAX_JETONS = 2048;

/** L'assistant n'existe que si la clé est posée : sinon l'écran le dit. */
export function assistantConfigure(): boolean {
  return Boolean((process.env.ANTHROPIC_API_KEY || '').trim());
}

/** Aujourd'hui, en toutes lettres, pour que le modèle sache quel jour on est. */
function jourDit(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
 * Une question du gérant, une réponse.
 *
 * La boucle s'arrête à la première écriture demandée : on n'exécute pas, on
 * décrit et on rend la main. Le modèle ne saura donc jamais si le geste a eu
 * lieu — et c'est pour cela que l'invite lui interdit de l'annoncer.
 */
export async function repondre(session: Session, tours: Tour[]): Promise<Reponse> {
  if (!assistantConfigure()) {
    throw badRequest('L’assistant n’est pas encore configuré sur le serveur.');
  }

  const { business: boutique } = await profile(session);
  const proprietaire = session.role === 'OWNER';
  const devise = boutique.currency || 'FCFA';
  const client = new Anthropic();

  const outils = outilsPour(proprietaire).map((defini) => ({
    name: defini.nom,
    description: defini.description,
    input_schema: defini.schema,
    strict: true,
  })) as Anthropic.Beta.BetaToolUnion[];

  const messages: Anthropic.Beta.BetaMessageParam[] = tours
    .filter((tour) => tour.texte.trim())
    .map((tour) => ({ role: tour.role, content: tour.texte.trim() }));
  if (messages.length === 0) throw badRequest('Dites quelque chose à l’assistant.');

  const systeme = invite({
    boutique: boutique.name,
    gerant: session.name || 'le gérant',
    proprietaire,
    devise,
    jour: jourDit(),
  });

  let dernierTexte = '';

  for (let tour = 0; tour < MAX_TOURS; tour += 1) {
    const reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: MAX_JETONS,
      // Une conversation de comptoir ne demande pas de longues délibérations,
      // et chaque jeton de réflexion est payé par le gérant.
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: systeme,
      tools: outils,
      messages,
    });

    // Un refus arrive avec un 200 : lire `content` sans vérifier donnerait
    // une réponse vide sans qu'on sache pourquoi.
    if (reponse.stop_reason === 'refusal') {
      return {
        texte: 'Je ne peux pas répondre à cette demande. Reformulez-la, ou passez par les écrans.',
        proposition: null,
      };
    }

    const texte = reponse.content
      .filter((bloc): bloc is Anthropic.Beta.BetaTextBlock => bloc.type === 'text')
      .map((bloc) => bloc.text)
      .join('\n')
      .trim();
    if (texte) dernierTexte = texte;

    const appels = reponse.content.filter(
      (bloc): bloc is Anthropic.Beta.BetaToolUseBlock => bloc.type === 'tool_use'
    );
    if (appels.length === 0) return { texte: dernierTexte, proposition: null };

    // Une écriture arrête tout : elle sort de la boucle sous forme de
    // proposition, et les lectures du même tour n'ont plus lieu d'être —
    // on ne continuera pas la conversation avec le modèle.
    const ecriture = appels.find((appel) => outil(appel.name)?.ecrit);
    if (ecriture) {
      const args = (ecriture.input || {}) as Record<string, unknown>;
      return {
        texte: dernierTexte,
        proposition: {
          outil: ecriture.name,
          args,
          resume: await decrire(session, ecriture.name, args, devise),
        },
      };
    }

    messages.push({ role: 'assistant', content: reponse.content });
    const resultats: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const appel of appels) {
      const defini = outil(appel.name);
      try {
        if (!defini) throw badRequest(`Outil inconnu : ${appel.name}.`);
        if (defini.proprietaire && !proprietaire) throw forbidden('Réservé au propriétaire.');
        const resultat = await lire(session, appel.name, (appel.input || {}) as Record<string, unknown>);
        resultats.push({
          type: 'tool_result',
          tool_use_id: appel.id,
          content: JSON.stringify(resultat ?? null),
        });
      } catch (souci) {
        // L'erreur repart au modèle plutôt que vers le gérant : il saura
        // souvent la contourner — chercher autrement, demander une précision.
        resultats.push({
          type: 'tool_result',
          tool_use_id: appel.id,
          is_error: true,
          content: souci instanceof Error ? souci.message : 'Erreur.',
        });
      }
    }
    messages.push({ role: 'user', content: resultats });
  }

  return {
    texte:
      dernierTexte ||
      'Je n’arrive pas à répondre à cette question. Essayez de la poser autrement.',
    proposition: null,
  };
}
