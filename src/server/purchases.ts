import { getSql, one, runTransaction, rows } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, conflict, notFound } from '../lib/http';
import { str, num, list, enumValue } from '../lib/validate';
import { round2, round3 } from '../utils/money';
import { referenceFormat } from '../lib/references';
import { loadCatalog } from './products';
import { findUnit, weightedAverageCost } from '../domain/units';
import { orderBalance, receivedValue, tooMuch } from '../domain/supplierDebt';
import { entete, refus } from '../domain/pieceJointe';
import { MOBILE_MONEY_PROVIDERS, PAYMENT_METHODS, providerFor } from '../domain/sale';
import type {
  DocumentRow,
  PurchaseOrder,
  PurchaseOrderItemRow,
  PurchaseOrderListRow,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  PurchaseReceiptRow,
  Session,
  SupplierDebt,
  SupplierPaymentRow,
} from '@/types';
import {
  DOCUMENT_KINDS,
  PO_MANUAL_STATUSES,
  orderTotal,
  receptionStatus,
  verrouDeSuppression,
  remainingOf,
  verrouDeCommande,
} from '../domain/purchase';

/**
 * Commandes fournisseurs et réceptions (§19-22).
 *
 * Règle centrale : commander n'est pas posséder. Créer une commande de 50 sacs
 * n'écrit aucun mouvement de stock ; seule la réception effective en écrit un, à
 * hauteur de ce qui a réellement été livré. La livraison partielle en découle
 * naturellement plutôt que d'être un cas particulier greffé après coup.
 */

const ORDER_COLUMNS = `
  id, business_id, reference, supplier_id, supplier_name, status,
  total_estimated::float8 AS total_estimated,
  amount_paid::float8 AS amount_paid, notes, manager_name, created_at, updated_at
`;

const ITEM_COLUMNS = `
  id, purchase_order_id, product_id, product_name, unit_label,
  unit_factor::float8 AS unit_factor,
  quantity_ordered::float8 AS quantity_ordered,
  quantity_received::float8 AS quantity_received,
  unit_cost::float8 AS unit_cost, position
`;

/**
 * Les statuts que recouvre chaque filtre de l'écran (§58).
 *
 * Le gérant ne pense pas en sept statuts : il pense « ce qui court encore »,
 * « ce qui est arrivé », « ce que j'ai annulé ». Le découpage est ici et non
 * dans l'écran, pour que le téléphone et le web filtrent pareil.
 */
const FILTRES: Record<string, readonly PurchaseOrderStatus[]> = {
  ouvertes: ['DRAFT', 'SENT', 'INVOICE_RECEIVED', 'PAID', 'PARTIALLY_RECEIVED'],
  livrees: ['RECEIVED'],
  annulees: ['CANCELLED'],
};

export async function listPurchaseOrders(
  businessId: string,
  {
    search = '',
    statut = '',
    from = null,
    to = null,
    limit = 100,
  }: {
    search?: string;
    statut?: string;
    from?: string | null;
    to?: string | null;
    limit?: number;
  } = {}
): Promise<PurchaseOrderListRow[]> {
  const sql = getSql();
  const term = search.trim() ? `%${search.trim()}%` : null;
  // Un filtre inconnu ne filtre rien plutôt que de ne rien rendre : une liste
  // vide ferait croire à une boutique sans commandes.
  const statuts = FILTRES[statut] ?? null;

  // Les deux comptes voyagent avec la ligne : sans eux, la liste ne saurait
  // pas quelles commandes sont encore effaçables et offrirait la corbeille sur
  // toutes, pour la voir refusée une fois sur deux (§58).
  return rows<PurchaseOrderListRow>(
    await sql`
    SELECT ${sql.unsafe(ORDER_COLUMNS)},
           (SELECT COUNT(*) FROM purchase_receipts r
             WHERE r.purchase_order_id = purchase_orders.id
               AND r.business_id = ${businessId})::int AS receptions,
           (SELECT COUNT(*) FROM supplier_payments p
             WHERE p.purchase_order_id = purchase_orders.id
               AND p.business_id = ${businessId})::int AS reglements,
           (SELECT COUNT(*) FROM purchase_order_items i
             WHERE i.purchase_order_id = purchase_orders.id
               AND i.business_id = ${businessId})::int AS lignes
      FROM purchase_orders
     WHERE business_id = ${businessId}
       AND (${term}::text IS NULL OR reference ILIKE ${term} OR supplier_name ILIKE ${term})
       AND (${statuts === null} OR status = ANY(${statuts ?? []}::text[]))
       AND (${from}::timestamptz IS NULL OR created_at >= ${from})
       AND (${to}::timestamptz IS NULL OR created_at <= ${to})
     ORDER BY created_at DESC
     LIMIT ${Math.min(limit, 300)}
  `
  );
}

export async function getPurchaseOrder(
  businessId: string,
  orderId: string
): Promise<PurchaseOrder> {
  const sql = getSql();
  const order = one<PurchaseOrderRow>(
    await sql`
      SELECT ${sql.unsafe(ORDER_COLUMNS)} FROM purchase_orders
       WHERE id = ${orderId} AND business_id = ${businessId}
    `
  );
  if (!order) throw notFound('Commande introuvable.');

  const [itemResult, receiptResult, documentResult, paymentResult] = await Promise.all([
    sql`SELECT ${sql.unsafe(ITEM_COLUMNS)} FROM purchase_order_items
         WHERE purchase_order_id = ${orderId} AND business_id = ${businessId}
         ORDER BY position`,
    sql`SELECT id, reference, notes, received_at FROM purchase_receipts
         WHERE purchase_order_id = ${orderId} AND business_id = ${businessId}
         ORDER BY received_at DESC`,
    // Le fichier ne voyage pas avec la fiche (§40, §59) : trois factures
    // scannées feraient dix mégaoctets de réponse à chaque ouverture de la
    // commande. La colonne `url` ne sort donc que lorsqu'elle porte un lien ;
    // le fichier, lui, se demande à sa propre route.
    sql`SELECT id, kind, name, created_at, mime,
               size_bytes::int AS size_bytes,
               CASE WHEN url LIKE 'data:%' THEN NULL ELSE url END AS url,
               (url LIKE 'data:%') AS has_file
          FROM documents
         WHERE business_id = ${businessId}
           AND reference_type = 'PURCHASE_ORDER' AND reference_id = ${orderId}
         ORDER BY created_at`,
    sql`SELECT id, amount::float8 AS amount, method, provider, note, created_at
          FROM supplier_payments
         WHERE business_id = ${businessId} AND purchase_order_id = ${orderId}
         ORDER BY created_at DESC`,
  ]);

  const items = rows<PurchaseOrderItemRow>(itemResult);
  return {
    ...order,
    items,
    receipts: rows<PurchaseReceiptRow>(receiptResult),
    documents: rows<DocumentRow>(documentResult),
    payments: rows<SupplierPaymentRow>(paymentResult),
    // Ce qui est livré, et ce qui reste à payer dessus : le calcul vit ici et
    // non dans l'écran, pour que le téléphone et le web disent le même chiffre.
    received: receivedValue(items),
    balance: orderBalance(receivedValue(items), order.amount_paid),
  };
}

/**
 * Lignes d'une commande.
 *
 * Chaque ligne référence un produit du catalogue : c'est ce qui permettra à la
 * réception d'augmenter le bon stock, dans la bonne unité de base. Commander un
 * article encore inconnu suppose donc de le créer d'abord — c'est aussi le
 * moment où on lui fixe un prix de vente.
 */
async function readItems(businessId: string, rawItems: unknown) {
  const entries = (list(rawItems, 'produits') as Record<string, unknown>[]).map((item, index) => ({
    productId: str(item.productId, `produit (ligne ${index + 1})`),
    unitId: (item.unitId as string | null) ?? null,
    quantity: round3(num(item.quantity, `quantité (ligne ${index + 1})`, { min: 0.001 })),
    unitCost: round2(num(item.unitCost, `coût (ligne ${index + 1})`, { min: 0, required: false })),
  }));

  const catalog = await loadCatalog(
    businessId,
    entries.map((entry) => entry.productId)
  );

  return entries.map((entry) => {
    const found = catalog.get(entry.productId);
    if (!found) throw badRequest('Un produit de la commande est introuvable dans votre catalogue.');
    const unit = findUnit(found.units, entry.unitId);
    return {
      productId: found.product.id,
      productName: found.product.name,
      unitLabel: unit.label,
      unitFactor: unit.factor,
      quantityOrdered: entry.quantity,
      // À défaut de coût saisi, on retient le coût connu du produit ramené au
      // conditionnement commandé : commander au carton n'est pas commander à la pièce.
      unitCost: entry.unitCost || round2((found.product.purchase_price || 0) * unit.factor),
    };
  });
}

/** Le fournisseur d'une commande, par son identifiant ou par son nom libre. */
async function resoudreFournisseur(session: Session, body: Record<string, unknown>) {
  const supplierId = str(body.supplierId, 'fournisseur', { required: false });
  let supplierName = str(body.supplierName, 'fournisseur', { required: false });

  if (supplierId) {
    const supplier = one<{ name: string }>(
      await getSql()`
        SELECT name FROM suppliers WHERE id = ${supplierId} AND business_id = ${session.businessId}
      `
    );
    if (!supplier) throw badRequest('Fournisseur introuvable.');
    supplierName = supplier.name;
  }
  if (!supplierName) throw badRequest('Indiquez le fournisseur.');
  return { supplierId, supplierName };
}

export async function createPurchaseOrder(session: Session, body: Record<string, unknown>) {
  const items = await readItems(session.businessId, body.items);
  const { supplierId, supplierName } = await resoudreFournisseur(session, body);

  const orderId = newId('po');
  const format = referenceFormat('PURCHASE_ORDER');
  const sql = getSql();

  await runTransaction([
    // Numéro tiré dans la transaction : une commande dont les lignes seraient
    // rejetées n'emporte pas un PO- avec elle.
    sql`
      WITH numero AS (
        INSERT INTO counters (business_id, kind, value)
        VALUES (${session.businessId}, ${format.counterKey}, 1)
        ON CONFLICT (business_id, kind) DO UPDATE SET value = counters.value + 1
        RETURNING value
      )
      INSERT INTO purchase_orders (
        id, business_id, reference, supplier_id, supplier_name,
        status, total_estimated, notes, manager_name, user_id
      ) VALUES (
        ${orderId}, ${session.businessId},
        ${format.prefix}::text || lpad((SELECT value FROM numero)::text, ${format.pad}::int, '0'),
        ${supplierId}, ${supplierName},
        'DRAFT', ${orderTotal(items.map((item) => ({ quantity: item.quantityOrdered, unitCost: item.unitCost })))},
        ${str(body.notes, 'notes', { required: false, max: 1000 })},
        ${nomDuGerant(session, body)}, ${session.userId}
      )
    `,
    ...items.map(
      (item, index) => sql`
        INSERT INTO purchase_order_items (
          id, business_id, purchase_order_id, product_id, product_name,
          unit_label, unit_factor, quantity_ordered, unit_cost, position
        ) VALUES (
          ${newId('poi')}, ${session.businessId}, ${orderId}, ${item.productId}, ${item.productName},
          ${item.unitLabel}, ${item.unitFactor}, ${item.quantityOrdered}, ${item.unitCost}, ${index}
        )
      `
    ),
  ]);

  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Le nom qui signera la commande (§62).
 *
 * À défaut de saisie, celui du compte qui enregistre : le cas courant est que
 * le gérant commande lui-même, et lui faire retaper son nom à chaque bon
 * serait un impôt. Le champ reste ouvert parce qu'un vendeur saisit parfois
 * pour le compte du patron, et c'est le patron que le fournisseur attend.
 */
function nomDuGerant(session: Session, body: Record<string, unknown>): string {
  return str(body.managerName, 'gérant', { required: false, max: 120 }) || session.name || '';
}

/**
 * Ce qui fige une commande, lu en base (§58).
 *
 * Les deux comptes sont demandés ensemble parce qu'ils répondent à la même
 * question — quelque chose dépend-il déjà de cette commande ? — et qu'un aller
 * de plus vers la base pour la poser deux fois ne dirait rien de neuf.
 */
async function verrou(
  businessId: string,
  orderId: string,
  geste: 'modifier' | 'supprimer' = 'modifier'
): Promise<string | null> {
  const sql = getSql();
  const compte = one<{ receptions: number; reglements: number }>(
    await sql`
      SELECT (SELECT COUNT(*) FROM purchase_receipts r
               WHERE r.purchase_order_id = ${orderId} AND r.business_id = ${businessId})::int
               AS receptions,
             (SELECT COUNT(*) FROM supplier_payments p
               WHERE p.purchase_order_id = ${orderId} AND p.business_id = ${businessId})::int
               AS reglements
    `
  );
  const order = one<{ status: PurchaseOrderStatus }>(
    await sql`
      SELECT status FROM purchase_orders
       WHERE id = ${orderId} AND business_id = ${businessId}
    `
  );
  if (!order) throw notFound('Commande introuvable.');
  const regle = geste === 'supprimer' ? verrouDeSuppression : verrouDeCommande;
  return regle(order.status, compte?.receptions ?? 0, compte?.reglements ?? 0);
}

/**
 * Réécrit une commande : fournisseur, lignes, observations (§58).
 *
 * Remplacement et non fusion : les lignes envoyées deviennent la commande. Une
 * modification ligne à ligne demanderait au téléphone de tenir des
 * identifiants de lignes à jour, et un écart entre les deux côtés produirait
 * une commande que personne n'a saisie.
 *
 * Le numéro de commande, lui, ne bouge pas. Le fournisseur a peut-être déjà le
 * PO-0012 sous les yeux : lui en renvoyer un autre pour les mêmes marchandises
 * ferait deux commandes dans son carnet.
 */
export async function updatePurchaseOrder(
  session: Session,
  orderId: string,
  body: Record<string, unknown>
): Promise<PurchaseOrder> {
  const empeche = await verrou(session.businessId, orderId);
  if (empeche) throw conflict(empeche);

  const items = await readItems(session.businessId, body.items);
  const { supplierId, supplierName } = await resoudreFournisseur(session, body);
  const sql = getSql();

  await runTransaction([
    sql`
      UPDATE purchase_orders
         SET supplier_id = ${supplierId}, supplier_name = ${supplierName},
             total_estimated = ${orderTotal(
               items.map((item) => ({ quantity: item.quantityOrdered, unitCost: item.unitCost }))
             )},
             notes = ${str(body.notes, 'notes', { required: false, max: 1000 })},
             manager_name = ${nomDuGerant(session, body)},
             updated_at = now()
       WHERE id = ${orderId} AND business_id = ${session.businessId}
    `,
    sql`
      DELETE FROM purchase_order_items
       WHERE purchase_order_id = ${orderId} AND business_id = ${session.businessId}
    `,
    ...items.map(
      (item, index) => sql`
        INSERT INTO purchase_order_items (
          id, business_id, purchase_order_id, product_id, product_name,
          unit_label, unit_factor, quantity_ordered, unit_cost, position
        ) VALUES (
          ${newId('poi')}, ${session.businessId}, ${orderId}, ${item.productId},
          ${item.productName}, ${item.unitLabel}, ${item.unitFactor},
          ${item.quantityOrdered}, ${item.unitCost}, ${index}
        )
      `
    ),
  ]);

  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Supprime une commande dont rien ne dépend (§58).
 *
 * Distincte de l'annulation, et les deux ont leur emploi : une commande annulée
 * a existé — le fournisseur l'a peut-être reçue — et reste à l'historique ; une
 * commande créée par erreur, mauvais fournisseur ou doublon, n'a aucune raison
 * d'encombrer la liste pour toujours.
 *
 * Elle ne s'efface que tant qu'elle n'a rien produit. Les lignes partent en
 * cascade avec elle ; les réceptions et les règlements aussi, et c'est
 * précisément pourquoi leur présence l'interdit.
 */
export async function deletePurchaseOrder(session: Session, orderId: string): Promise<void> {
  const empeche = await verrou(session.businessId, orderId, 'supprimer');
  if (empeche) throw conflict(empeche);

  const sql = getSql();
  // `business_id` dans la clé, bien que `verrou` ait déjà refusé la commande
  // d'une autre boutique : le §29 veut l'identifiant de boutique dans la clé de
  // toute écriture, jamais dans un simple filtre d'affichage. Aucun test ne
  // peut l'atteindre — c'est précisément le but : la garde reste si un jour le
  // verrou change.
  //
  // Les pièces jointes partent avec, et il faut le dire ici : `documents` ne
  // pointe pas la commande par une clé étrangère mais par un couple
  // type/identifiant, générique à toute l'application — aucune cascade ne les
  // emporterait. Depuis le §59 elles portent des fichiers : laissées là, elles
  // tiendraient la place sans commande pour les montrer ni écran pour les
  // effacer.
  //
  // Et le stock qu'elle a fait entrer lui est rendu (§65). Supprimer une
  // commande livrée, c'est dire « cette livraison n'a jamais eu lieu » :
  // laisser les marchandises sur l'étagère ferait de l'inventaire un
  // mensonge, découvert des semaines plus tard sans rien pour l'expliquer.
  const order = await getPurchaseOrder(session.businessId, orderId);
  const rendu = new Map<string, number>();
  for (const item of order.items) {
    if (!item.product_id || item.quantity_received <= 0) continue;
    rendu.set(
      item.product_id,
      round3((rendu.get(item.product_id) || 0) + item.quantity_received * item.unit_factor)
    );
  }

  // La contrainte de stock positif arrêterait de toute façon l'écriture, mais
  // avec la phrase d'une vente ratée. Mieux vaut dire ici ce qui cloche : les
  // marchandises sont parties, on ne peut plus faire comme si elles n'étaient
  // jamais arrivées.
  if (rendu.size > 0) {
    const catalogue = await loadCatalog(session.businessId, [...rendu.keys()]);
    for (const [productId, quantite] of rendu) {
      const connu = catalogue.get(productId);
      if (connu && connu.product.stock_quantity < quantite) {
        throw conflict(
          `Impossible : il ne reste que ${connu.product.stock_quantity} ${connu.product.base_unit} de ${connu.product.name} en stock, et cette commande en avait fait entrer ${quantite}. Une partie est déjà vendue.`
        );
      }
    }
  }

  await runTransaction([
    ...[...rendu].map(
      ([productId, quantite]) => sql`
        UPDATE products
           SET stock_quantity = stock_quantity - ${quantite}, updated_at = now()
         WHERE id = ${productId} AND business_id = ${session.businessId}
      `
    ),
    // Les mouvements de ses réceptions partent aussi : `stock_movements`
    // désigne sa pièce par un couple type/identifiant, comme `documents`, et
    // aucune cascade ne les emporterait. Un mouvement sans réception pour le
    // justifier serait pire qu'une ligne manquante.
    sql`
      DELETE FROM stock_movements
       WHERE business_id = ${session.businessId}
         AND reference_type = 'PURCHASE_RECEIPT'
         AND reference_id IN (
           SELECT id FROM purchase_receipts
            WHERE purchase_order_id = ${orderId} AND business_id = ${session.businessId}
         )
    `,
    sql`
      DELETE FROM documents
       WHERE business_id = ${session.businessId}
         AND reference_type = 'PURCHASE_ORDER' AND reference_id = ${orderId}
    `,
    sql`
      DELETE FROM purchase_orders
       WHERE id = ${orderId} AND business_id = ${session.businessId}
    `,
  ]);
}

/**
 * Change le statut administratif d'une commande (envoyée, facture reçue, payée…).
 * Les statuts de livraison ne sont pas modifiables à la main : ils sont déduits
 * des quantités effectivement reçues.
 */
export async function updatePurchaseOrderStatus(
  session: Session,
  orderId: string,
  body: Record<string, unknown>
) {
  const order = await getPurchaseOrder(session.businessId, orderId);
  const status = enumValue(body.status, 'statut', PO_MANUAL_STATUSES);
  if (order.status === 'CANCELLED') throw conflict('Cette commande est annulée.');
  if (status === 'CANCELLED' && order.items.some((item) => item.quantity_received > 0)) {
    throw conflict('Cette commande a déjà été partiellement livrée.');
  }

  /*
   * « Livrée » n'est pas une étiquette qu'on pose : c'est une réception (§63).
   *
   * Elle emprunte donc le seul chemin qui fasse entrer du stock, celui du
   * bouton « Marquer comme livrée » (§21-22). Écrire le statut à la main
   * laisserait une commande dite livrée sans reçu, sans mouvement de stock,
   * sans coût d'achat recalculé — et le stock mentirait dès la première.
   *
   * Ne reste à recevoir que ce qui reste : sur une commande déjà livrée aux
   * trois quarts, seul le dernier quart entre. Et sur une commande déjà
   * entièrement reçue, rien ne bouge — choisir « Livrée » deux fois ne double
   * pas le stock.
   */
  if (status === 'RECEIVED') {
    const lignes = order.items
      .map((item) => ({ itemId: item.id, quantity: remainingOf(item) }))
      .filter((ligne) => ligne.quantity > 0);
    if (lignes.length === 0) return order;
    return receivePurchaseOrder(session, orderId, {
      lines: lignes,
      notes: 'Commande marquée livrée',
    });
  }

  await getSql()`
    UPDATE purchase_orders SET status = ${status}, updated_at = now()
     WHERE id = ${orderId} AND business_id = ${session.businessId}
  `;
  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Pièce jointe : bon de commande, facture fournisseur, preuve de paiement (§20).
 *
 * Deux façons de joindre, et une seule colonne pour les deux (§59). Soit un
 * **lien** vers une pièce rangée ailleurs — c'était la seule possibilité
 * jusqu'ici —, soit le **fichier** lui-même, en `data:` URL, comme le
 * justificatif de dépense (§40).
 *
 * Le fichier est vérifié ici et pas seulement à l'écran : le serveur ne fait
 * jamais confiance au client (§35), et une pièce jointe est précisément ce
 * qu'on voudrait lui faire avaler.
 */
export async function attachDocument(
  session: Session,
  orderId: string,
  body: Record<string, unknown>
) {
  await getPurchaseOrder(session.businessId, orderId);
  const kind = enumValue(body.kind, 'type de document', Object.keys(DOCUMENT_KINDS));
  const contenu = typeof body.content === 'string' ? body.content.trim() : '';
  const lien = str(body.url, 'lien', { required: false, max: 2000 });

  if (contenu) {
    const empeche = refus(contenu);
    if (empeche) throw badRequest(empeche);
  } else if (!lien) {
    throw badRequest('Joignez un fichier ou donnez un lien.');
  }

  const lu = contenu ? entete(contenu) : null;
  await getSql()`
    INSERT INTO documents (id, business_id, kind, reference_type, reference_id,
                           name, url, mime, size_bytes)
    VALUES (${newId('doc')}, ${session.businessId}, ${kind}, 'PURCHASE_ORDER', ${orderId},
            ${str(body.name, 'nom du document', { max: 200 })},
            ${contenu || lien}, ${lu?.mime ?? null}, ${lu ? Math.round(lu.octets) : null})
  `;
  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Le fichier d'une pièce jointe, pour sa propre route (§59).
 *
 * L'identifiant de boutique est dans la clé et non dans un filtre : un
 * document d'une autre quincaillerie n'est pas « masqué », il est introuvable
 * (§29). Sans cela, une pièce jointe deviendrait la seule porte par laquelle
 * on verrait la facture du voisin.
 */
export async function documentFile(
  businessId: string,
  documentId: string
): Promise<{ name: string; mime: string; contenu: string }> {
  const row = one<{ name: string; mime: string | null; url: string | null }>(
    await getSql()`
      SELECT name, mime, url FROM documents
       WHERE id = ${documentId} AND business_id = ${businessId}
    `
  );
  if (!row || !row.url || !row.url.startsWith('data:')) {
    throw notFound('Ce document ne porte aucun fichier.');
  }
  const lu = entete(row.url);
  if (!lu) throw notFound('Ce document ne porte aucun fichier.');
  return { name: row.name, mime: row.mime || lu.mime, contenu: row.url };
}

/**
 * Détache une pièce jointe (§59).
 *
 * Permettre d'en joindre sans permettre d'en retirer, c'est laisser une
 * facture mise sur la mauvaise commande y rester pour toujours — et le poids
 * avec elle.
 */
export async function deleteDocument(session: Session, documentId: string): Promise<void> {
  const row = one<{ id: string }>(
    await getSql()`
      SELECT id FROM documents
       WHERE id = ${documentId} AND business_id = ${session.businessId}
         AND reference_type = 'PURCHASE_ORDER'
    `
  );
  if (!row) throw notFound('Document introuvable.');
  await getSql()`
    DELETE FROM documents WHERE id = ${documentId} AND business_id = ${session.businessId}
  `;
}

/**
 * Réception d'une livraison (§21-22).
 *
 * C'est ici, et seulement ici, que le stock d'un achat augmente. Le coût d'achat
 * du produit est recalculé en moyenne pondérée : réassortir 400 pièces à 320
 * quand on en détient 100 à 300 donne 316, pas 320. Sans cette pondération, la
 * marge de tous les articles en rayon sauterait à chaque livraison.
 */
export async function receivePurchaseOrder(
  session: Session,
  orderId: string,
  body: Record<string, unknown>
) {
  const order = await getPurchaseOrder(session.businessId, orderId);
  if (order.status === 'CANCELLED') throw conflict('Cette commande est annulée.');

  // Les quantités sont cumulées par ligne de commande avant d'être vérifiées :
  // deux entrées visant la même ligne — 30 puis 30 sur un reliquat de 50 —
  // passent chacune isolément et ne dépassent qu'ensemble. Sans ce regroupement,
  // seule la contrainte les arrêtait, et l'écran affichait une erreur technique
  // au lieu d'expliquer ce qui cloche.
  const itemsById = new Map(order.items.map((item) => [item.id, item]));
  const quantities = new Map<string, number>();
  (list(body.lines, 'lignes reçues') as Record<string, unknown>[]).forEach((line, index) => {
    const item = itemsById.get(str(line.itemId, `ligne ${index + 1}`));
    if (!item) throw badRequest('Ligne de commande introuvable.');
    const quantity = round3(num(line.quantity, `quantité reçue (ligne ${index + 1})`, { min: 0 }));
    quantities.set(item.id, round3((quantities.get(item.id) || 0) + quantity));
  });

  const lines = [...quantities].map(([itemId, quantity]) => {
    const item = itemsById.get(itemId);
    // La clé vient d'être posée depuis `itemsById` : l'absence est impossible,
    // mais la signaler vaut mieux que de la laisser devenir un `undefined` muet.
    if (!item) throw badRequest('Ligne de commande introuvable.');
    if (quantity > remainingOf(item)) {
      throw conflict(`Vous recevez plus de ${item.product_name} qu'il n'en reste à livrer.`);
    }
    return { item, quantity };
  });

  const received = lines.filter((line) => line.quantity > 0);
  if (received.length === 0) throw badRequest('Indiquez au moins une quantité reçue.');

  const catalog = await loadCatalog(
    session.businessId,
    received.map((line) => line.item.product_id).filter((id): id is string => Boolean(id))
  );

  const receiptId = newId('rcp');
  const format = referenceFormat('RECEIPT');
  const sql = getSql();

  const queries = [
    // Une réception qui dépasserait le reste à livrer est rejetée par la
    // contrainte : son numéro doit disparaître avec elle.
    sql`
      WITH numero AS (
        INSERT INTO counters (business_id, kind, value)
        VALUES (${session.businessId}, ${format.counterKey}, 1)
        ON CONFLICT (business_id, kind) DO UPDATE SET value = counters.value + 1
        RETURNING value
      )
      INSERT INTO purchase_receipts (
        id, business_id, purchase_order_id, reference, notes, user_id
      ) VALUES (
        ${receiptId}, ${session.businessId}, ${orderId},
        ${format.prefix}::text || lpad((SELECT value FROM numero)::text, ${format.pad}::int, '0'),
        ${str(body.notes, 'notes', { required: false, max: 500 })}, ${session.userId}
      )
    `,
  ];

  // Le coût moyen est cumulé produit par produit : une même livraison peut
  // porter deux lignes du même article (un carton + des pièces), et repartir du
  // coût lu en base pour la seconde ignorerait ce que la première vient d'ajouter.
  const runningCost = new Map();

  received.forEach(({ item, quantity }) => {
    const baseQuantity = round3(quantity * item.unit_factor);
    const unitBaseCost = round2(item.unit_cost / (item.unit_factor || 1));

    queries.push(
      sql`
        INSERT INTO purchase_receipt_items (
          id, business_id, purchase_receipt_id, purchase_order_item_id,
          product_id, quantity, unit_cost
        ) VALUES (
          ${newId('rci')}, ${session.businessId}, ${receiptId}, ${item.id},
          ${item.product_id}, ${quantity}, ${item.unit_cost}
        )
      `,
      sql`
        UPDATE purchase_order_items
           SET quantity_received = quantity_received + ${quantity}
         WHERE id = ${item.id} AND business_id = ${session.businessId}
      `
    );

    if (!item.product_id) return;
    const known = catalog.get(item.product_id);
    if (!known) return;

    const state = runningCost.get(item.product_id) || {
      quantity: known.product.stock_quantity,
      cost: known.product.purchase_price,
    };
    const cost = weightedAverageCost(state.quantity, state.cost, baseQuantity, unitBaseCost);
    runningCost.set(item.product_id, {
      quantity: round3(state.quantity + baseQuantity),
      cost,
    });

    queries.push(
      sql`
        UPDATE products
           SET stock_quantity = stock_quantity + ${baseQuantity},
               purchase_price = ${cost},
               updated_at = now()
         WHERE id = ${item.product_id} AND business_id = ${session.businessId}
      `,
      sql`
        INSERT INTO stock_movements (
          id, business_id, product_id, type, quantity, stock_after,
          reference_type, reference_id, user_id, note
        ) VALUES (
          ${newId('mv')}, ${session.businessId}, ${item.product_id}, 'PURCHASE_RECEIPT',
          ${baseQuantity},
          (SELECT stock_quantity FROM products
            WHERE id = ${item.product_id} AND business_id = ${session.businessId}),
          'PURCHASE_RECEIPT', ${receiptId}, ${session.userId}, ${`Réception ${order.reference}`}
        )
      `
    );
  });

  // Le statut de livraison est recalculé à partir des quantités projetées plutôt
  // que saisi : une commande ne peut pas être « livrée » s'il reste des lignes.
  const projected = order.items.map((item) => {
    const line = received.find((entry) => entry.item.id === item.id);
    return {
      quantity_ordered: item.quantity_ordered,
      quantity_received: item.quantity_received + (line ? line.quantity : 0),
    };
  });

  queries.push(sql`
    UPDATE purchase_orders SET status = ${receptionStatus(projected, order.status)}, updated_at = now()
     WHERE id = ${orderId} AND business_id = ${session.businessId}
  `);

  await runTransaction(queries);
  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Enregistre un règlement au fournisseur (§53).
 *
 * Trois garde-fous, et chacun répond à une erreur réelle :
 *
 * — **On ne règle que ce qui est arrivé.** Payer d'avance une commande non
 *   livrée est une avance, pas un règlement, et le §53 ne traite pas les
 *   avances. Le plafond est donc la valeur du livré, non le total commandé.
 * — **Le dépassement est refusé, ici et pas seulement à l'écran** : deux
 *   vendeurs peuvent régler la même commande en même temps.
 * — **Une commande annulée ne se règle pas.** Elle n'a rien livré, ou ce
 *   qu'elle a livré a été repris.
 */
export async function recordSupplierPayment(
  session: Session,
  orderId: string,
  body: Record<string, unknown>
): Promise<PurchaseOrder> {
  const order = await getPurchaseOrder(session.businessId, orderId);
  if (order.status === 'CANCELLED') {
    throw conflict('Cette commande est annulée : il n’y a rien à régler.');
  }

  const amount = round2(num(body.amount, 'montant', { min: 0.01 }));
  const method = enumValue(body.method || 'CASH', 'moyen de paiement', PAYMENT_METHODS);
  const provider = providerFor(
    method,
    body.provider ? enumValue(body.provider, 'opérateur', MOBILE_MONEY_PROVIDERS) : null
  );
  const note = str(body.note, 'motif', { required: false, max: 300 });

  if (order.balance <= 0) {
    throw conflict(
      order.received > 0
        ? 'Cette commande est déjà soldée.'
        : 'Rien n’a encore été livré sur cette commande : il n’y a rien à régler.'
    );
  }
  if (tooMuch(amount, order.balance)) {
    throw conflict(
      `Le règlement dépasse ce qui reste dû : il reste ${order.balance.toLocaleString('fr-FR')} à payer.`
    );
  }

  const sql = getSql();
  await runTransaction([
    sql`
      UPDATE purchase_orders
         SET amount_paid = amount_paid + ${amount}, updated_at = now()
       WHERE id = ${orderId} AND business_id = ${session.businessId}
    `,
    sql`
      INSERT INTO supplier_payments (
        id, business_id, purchase_order_id, method, provider, amount, note, user_id
      )
      VALUES (${newId('spay')}, ${session.businessId}, ${orderId}, ${method},
              ${provider}, ${amount}, ${note}, ${session.userId})
    `,
  ]);

  return getPurchaseOrder(session.businessId, orderId);
}

/**
 * Ce qui reste dû à chaque fournisseur (§53).
 *
 * Agrégé par fournisseur et non par commande : c'est au fournisseur qu'on paie,
 * et c'est lui qui réclame. Les commandes soldées n'y figurent pas — un
 * fournisseur à zéro n'a rien à faire dans une liste de dettes.
 *
 * Les commandes annulées ne sont pas écartées, et n'ont pas à l'être : une
 * commande déjà livrée ne peut plus être annulée, donc une commande annulée n'a
 * rien reçu et ne doit rien. Un filtre de statut ici ferait croire à une règle
 * qui n'existe pas.
 *
 * Le dû d'une commande se calcule en SQL sur ses lignes reçues, pour la même
 * raison que le reste : une somme faite sur les quelques commandes affichées ne
 * serait pas la dette, mais le total de l'écran.
 */
export async function supplierDebts(businessId: string): Promise<SupplierDebt[]> {
  return rows<SupplierDebt>(
    await getSql()`
      WITH livre AS (
        SELECT o.id, o.supplier_id, o.supplier_name, o.amount_paid::float8 AS paid,
               COALESCE(SUM(i.quantity_received * i.unit_cost), 0)::float8 AS received
          FROM purchase_orders o
          LEFT JOIN purchase_order_items i ON i.purchase_order_id = o.id
         WHERE o.business_id = ${businessId}
         GROUP BY o.id, o.supplier_id, o.supplier_name, o.amount_paid
      )
      SELECT COALESCE(supplier_name, 'Fournisseur inconnu') AS name,
             supplier_id AS id,
             SUM(GREATEST(received - paid, 0))::float8 AS owed,
             COUNT(*) FILTER (WHERE received - paid > 0)::int AS orders
        FROM livre
       GROUP BY supplier_id, supplier_name
      HAVING SUM(GREATEST(received - paid, 0)) > 0
       ORDER BY owed DESC
    `
  );
}
