import { getSql, one, rows } from '../lib/db';
import { notFound } from '../lib/http';
import { round2 } from '../utils/money';
import { EXPENSE_CATEGORY_LABELS, marginRate } from '../domain/report';
import { financialReport, type ReportBounds } from './reports';
import { periodBounds } from './history';
import { isLowStock, isOutOfStock } from '../domain/stock';
import { exportFileName, frenchNumber, toCsv, type CsvColumn } from '../domain/csv';
import { PAYMENT_STATUS_LABELS, paymentLabel } from '../domain/sale';
import type {
  FinancialReport,
  MobileMoneyProvider,
  PaymentMethod,
  PaymentStatus,
  ProductProfit,
  Session,
} from '@/types';

/**
 * Exports comptables et sauvegarde (§48).
 *
 * Le gérant n'est pas le seul à regarder ses chiffres : il y a le comptable en
 * fin d'exercice, l'associé, parfois la banque. Aucun d'eux n'ouvrira
 * l'application — ils veulent un fichier. Jusqu'ici il n'y avait aucun moyen
 * d'en sortir un, et des années de ventes étaient prisonnières de l'écran.
 *
 * Cinq fichiers, parce que ce sont cinq questions distinctes : ce que je
 * détiens, ce que j'ai vendu, ce qu'on me doit, ce que j'ai gagné sur la
 * période et quels produits l'ont gagné. Un seul fichier qui les mélangerait
 * obligerait à les démêler dans le tableur.
 *
 * Et une sauvegarde JSON, qui n'est pas un export comptable mais un filet :
 * tout ce que la boutique contient, dans un seul fichier, relisible par une
 * machine. C'est ce qu'on garde avant de fermer une boutique (§46), et ce qu'on
 * emporte si l'on quitte un jour ce logiciel.
 */

interface LigneStock {
  sku: string | null;
  name: string;
  category: string | null;
  base_unit: string;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  archived: boolean;
  conditionnements: string | null;
}

/** L'état du stock : ce que la boutique détient, et ce que ça vaut. */
export async function stocksRows(businessId: string): Promise<LigneStock[]> {
  return rows<LigneStock>(
    await getSql()`
      SELECT p.sku, p.name, p.category, p.base_unit,
             p.purchase_price::float8 AS purchase_price,
             p.selling_price::float8 AS selling_price,
             p.stock_quantity::float8 AS stock_quantity,
             p.low_stock_threshold::float8 AS low_stock_threshold,
             p.archived,
             -- trim_scale retire les zéros de fin que numeric traîne :
             -- « 40.000 sac à 190000.00 » se lit mal dans un tableur, et le
             -- gérant n'a jamais saisi ces décimales.
             (SELECT string_agg(u.label || ' = ' || trim_scale(u.factor) || ' ' || p.base_unit ||
                                ' à ' || trim_scale(u.price), ' | ' ORDER BY u.factor)
                FROM product_units u
               WHERE u.product_id = p.id AND u.is_base = false) AS conditionnements
        FROM products p
       WHERE p.business_id = ${businessId}
       ORDER BY p.name
    `
  );
}

/** « Rupture », « Stock bas » ou « OK » — le mot que l'écran affiche déjà. */
function etatDuStock(ligne: LigneStock): string {
  if (isOutOfStock(ligne)) return 'Rupture';
  return isLowStock(ligne) ? 'Stock bas' : 'OK';
}

const COLONNES_STOCK: CsvColumn<LigneStock>[] = [
  { title: 'Référence', value: (l) => l.sku },
  { title: 'Produit', value: (l) => l.name },
  { title: 'Rayon', value: (l) => l.category },
  { title: 'Unité', value: (l) => l.base_unit },
  { title: 'Prix d’achat', value: (l) => l.purchase_price },
  { title: 'Prix de vente', value: (l) => l.selling_price },
  { title: 'Marge unitaire', value: (l) => round2(l.selling_price - l.purchase_price) },
  {
    title: 'Taux de marge (%)',
    value: (l) => marginRate(l.selling_price - l.purchase_price, l.selling_price),
  },
  { title: 'Stock', value: (l) => l.stock_quantity },
  { title: 'Seuil d’alerte', value: (l) => l.low_stock_threshold },
  { title: 'État', value: (l) => etatDuStock(l) },
  { title: 'Valeur au coût', value: (l) => round2(l.stock_quantity * l.purchase_price) },
  { title: 'Valeur à la vente', value: (l) => round2(l.stock_quantity * l.selling_price) },
  { title: 'Conditionnements', value: (l) => l.conditionnements },
  { title: 'Archivé', value: (l) => (l.archived ? 'oui' : 'non') },
];

interface LigneVente {
  reference: string;
  invoice_reference: string;
  created_at: string | Date;
  customer_name: string | null;
  status: string;
  payment_method: PaymentMethod;
  payment_provider: MobileMoneyProvider | null;
  payment_status: PaymentStatus;
  sale_total: number;
  discount: number;
  amount_paid: number;
  product_name: string | null;
  unit_label: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  unit_cost: number | null;
}

/**
 * L'historique des ventes, une ligne par article vendu.
 *
 * Une ligne par vente perdrait le détail des articles ; une ligne par article
 * répète l'en-tête de la vente, et c'est exactement la forme qu'un tableur sait
 * regrouper. Le comptable filtre sur la référence, le gérant trie par produit.
 */
export async function salesRows(businessId: string): Promise<LigneVente[]> {
  return rows<LigneVente>(
    await getSql()`
      SELECT s.reference, s.invoice_reference, s.created_at, s.customer_name, s.status,
             s.payment_method, s.payment_provider, s.payment_status,
             s.total::float8 AS sale_total, s.discount::float8 AS discount,
             s.amount_paid::float8 AS amount_paid,
             i.product_name, i.unit_label,
             i.quantity::float8 AS quantity, i.unit_price::float8 AS unit_price,
             i.line_total::float8 AS line_total, i.unit_cost::float8 AS unit_cost
        FROM sales s
        LEFT JOIN sale_items i ON i.sale_id = s.id
       WHERE s.business_id = ${businessId}
       ORDER BY s.created_at DESC, i.position
    `
  );
}

/** Date et heure en colonnes séparées : un tableur trie mal un horodatage. */
function jour(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function heure(value: string | Date): string {
  return new Date(value).toISOString().slice(11, 16);
}

const COLONNES_VENTES: CsvColumn<LigneVente>[] = [
  { title: 'Date', value: (l) => jour(l.created_at) },
  { title: 'Heure (UTC)', value: (l) => heure(l.created_at) },
  { title: 'Vente', value: (l) => l.reference },
  { title: 'Facture', value: (l) => l.invoice_reference },
  { title: 'Client', value: (l) => l.customer_name || 'Client comptoir' },
  { title: 'Produit', value: (l) => l.product_name },
  { title: 'Conditionnement', value: (l) => l.unit_label },
  { title: 'Quantité', value: (l) => l.quantity },
  { title: 'Prix unitaire', value: (l) => l.unit_price },
  { title: 'Total ligne', value: (l) => l.line_total },
  {
    title: 'Coût ligne',
    value: (l) =>
      l.unit_cost === null || l.quantity === null ? null : round2(l.unit_cost * l.quantity),
  },
  {
    title: 'Marge ligne',
    value: (l) =>
      l.line_total === null || l.unit_cost === null || l.quantity === null
        ? null
        : round2(l.line_total - l.unit_cost * l.quantity),
  },
  { title: 'Remise (vente)', value: (l) => l.discount },
  { title: 'Total vente', value: (l) => l.sale_total },
  { title: 'Encaissé', value: (l) => l.amount_paid },
  { title: 'Reste dû', value: (l) => round2(Math.max(0, l.sale_total - l.amount_paid)) },
  { title: 'Règlement', value: (l) => paymentLabel(l.payment_method, l.payment_provider) },
  {
    title: 'Statut paiement',
    value: (l) => PAYMENT_STATUS_LABELS[l.payment_status] ?? l.payment_status,
  },
  { title: 'Vente annulée', value: (l) => (l.status === 'CANCELLED' ? 'oui' : 'non') },
];

interface LigneClient {
  name: string;
  phone: string | null;
  address: string | null;
  spent: number;
  owed: number;
  open_count: number;
  oldest_open: string | Date | null;
}

/** Le fichier clients, avec le carnet de crédit (§45). */
export async function customersRows(businessId: string): Promise<LigneClient[]> {
  return rows<LigneClient>(
    await getSql()`
      SELECT c.name, c.phone, c.address,
             COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total ELSE 0 END), 0)::float8 AS spent,
             COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' AND s.amount_paid < s.total
                               THEN s.total - s.amount_paid ELSE 0 END), 0)::float8 AS owed,
             COUNT(*) FILTER (
               WHERE s.status = 'COMPLETED' AND s.amount_paid < s.total
             )::int AS open_count,
             MIN(s.created_at) FILTER (
               WHERE s.status = 'COMPLETED' AND s.amount_paid < s.total
             ) AS oldest_open
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND s.business_id = c.business_id
       WHERE c.business_id = ${businessId}
       GROUP BY c.id, c.name, c.phone, c.address
       ORDER BY owed DESC, c.name
    `
  );
}

const COLONNES_CLIENTS: CsvColumn<LigneClient>[] = [
  { title: 'Client', value: (l) => l.name },
  { title: 'Téléphone', value: (l) => l.phone },
  { title: 'Adresse', value: (l) => l.address },
  { title: 'Total acheté', value: (l) => round2(l.spent) },
  { title: 'Solde dû', value: (l) => round2(l.owed) },
  { title: 'Achats non soldés', value: (l) => l.open_count },
  { title: 'Plus ancienne dette', value: (l) => (l.oldest_open ? jour(l.oldest_open) : null) },
];

// ───────────────────── Rapport financier (§55) ────────────────────────
//
// Deux fichiers plutôt qu'un, pour la même raison que les trois précédents :
// un tableur lit des colonnes, pas des sections. Le résultat de la période est
// une suite de postes — un libellé, un montant ; la rentabilité est une ligne
// par produit, avec une dizaine de colonnes. Les empiler dans un seul fichier
// décalerait l'un des deux d'une colonne sur l'autre.

interface LignePoste {
  poste: string;
  montant: number;
  /** Ce que le poste recouvre, quand le libellé seul ne suffit pas. */
  detail: string | null;
}

/**
 * Le compte de résultat de la période, poste par poste (§39).
 *
 * Son ordre est celui de l'écran — du chiffre d'affaires au bénéfice net —
 * parce que c'est l'ordre dans lequel le chiffre se construit, et qu'un
 * comptable qui relit le fichier doit retrouver le même cheminement.
 */
export function reportRows(report: FinancialReport): LignePoste[] {
  const { totals } = report;
  const postes: LignePoste[] = [
    { poste: 'Ventes en stock', montant: totals.salesRevenue, detail: `${report.salesCount} vente(s)` },
    {
      poste: 'Ventes hors stock',
      montant: totals.outOfStockRevenue,
      detail: `${report.outOfStockCount} opération(s)`,
    },
    { poste: 'Recettes hors vente', montant: totals.otherRevenue, detail: null },
    { poste: "Chiffre d'affaires", montant: totals.revenue, detail: null },
    { poste: 'Coût des marchandises vendues', montant: -totals.costOfGoods, detail: null },
    {
      poste: 'Marge brute',
      montant: totals.grossMargin,
      // `frenchNumber` et non le nombre brut : glissé dans une chaîne, il
      // garderait son point décimal au milieu d'un fichier où toutes les autres
      // décimales sont des virgules.
      detail: totals.marginRate === null ? null : `${frenchNumber(totals.marginRate)} %`,
    },
  ];

  report.expensesByCategory.forEach((poste) => {
    postes.push({
      poste: `Dépense — ${EXPENSE_CATEGORY_LABELS[poste.category] ?? 'Divers'}`,
      montant: -poste.amount,
      detail: `${poste.count} dépense(s)`,
    });
  });

  postes.push(
    // L'achat de stock est sorti de la caisse mais n'est pas une charge de la
    // période : la marchandise est déjà comptée par son coût d'achat à la
    // vente. Le fichier le dit, plutôt que de le soustraire en silence (§39).
    {
      poste: 'dont achat de stock (non déduit)',
      montant: totals.stockPurchases,
      detail: 'Déjà compté dans le coût des marchandises vendues',
    },
    { poste: "Charges d'exploitation déduites", montant: -totals.operatingExpenses, detail: null },
    { poste: 'Bénéfice net', montant: totals.netProfit, detail: null }
  );

  return postes;
}

const COLONNES_RAPPORT: CsvColumn<LignePoste>[] = [
  { title: 'Poste', value: (l) => l.poste },
  { title: 'Montant', value: (l) => round2(l.montant) },
  { title: 'Détail', value: (l) => l.detail },
];

const COLONNES_RENTABILITE: CsvColumn<ProductProfit>[] = [
  { title: 'Produit', value: (l) => l.productName },
  { title: 'Unité', value: (l) => l.baseUnit },
  { title: 'Quantité vendue', value: (l) => l.quantity },
  { title: "Chiffre d'affaires", value: (l) => l.revenue },
  { title: "Coût d'achat", value: (l) => l.cost },
  { title: 'Marge', value: (l) => l.margin },
  { title: 'Taux de marge (%)', value: (l) => l.marginRate },
  { title: 'Quantité hors stock', value: (l) => l.outOfStockQuantity },
  { title: 'CA hors stock', value: (l) => l.outOfStockRevenue },
  { title: 'Marge hors stock', value: (l) => l.outOfStockMargin },
];

/**
 * Les exports, par leur nom d'adresse.
 *
 * Chacun reçoit les bornes de la période. Les trois premiers n'en font rien —
 * un inventaire est un état du jour, pas d'une période — mais les deux du
 * rapport (§55) en vivent, et une signature unique évite à la route de savoir
 * lesquels sont datés.
 */
export const EXPORTS = {
  stocks: async (businessId: string) => toCsv(await stocksRows(businessId), COLONNES_STOCK),
  ventes: async (businessId: string) => toCsv(await salesRows(businessId), COLONNES_VENTES),
  clients: async (businessId: string) => toCsv(await customersRows(businessId), COLONNES_CLIENTS),
  rapport: async (businessId: string, bounds: ReportBounds) =>
    toCsv(reportRows(await financialReport(businessId, bounds)), COLONNES_RAPPORT),
  rentabilite: async (businessId: string, bounds: ReportBounds) =>
    toCsv((await financialReport(businessId, bounds)).products, COLONNES_RENTABILITE),
} as const;

export type ExportKind = keyof typeof EXPORTS;

/**
 * Ce qu'une demande d'export doit produire : des bornes, et un nom de fichier.
 *
 * La décision vit ici et non dans la route, pour qu'elle soit vérifiable. Deux
 * choix s'y jouent :
 *
 * — **Sans période demandée, c'est le mois en cours**, et non tout l'historique.
 *   Un rapport « depuis l'ouverture » téléchargé par mégarde ne ressemble pas à
 *   une erreur : il ressemble à un très bon mois.
 * — **Le nom du fichier porte la période**, sauf pour l'inventaire, qui est un
 *   état du jour et non d'une période. Deux fichiers nommés pareil dans un
 *   dossier « Téléchargements » finissent en « rapport (3).csv », et plus
 *   personne ne sait lequel couvre quoi.
 */
export function exportRequest(kind: ExportKind, period: string | null) {
  const retenue = period || 'month';
  return {
    bounds: periodBounds(retenue),
    fileName: exportFileName(kind === 'stocks' ? kind : `${kind}-${retenue}`),
  };
}

export function isExportKind(value: string): value is ExportKind {
  return value in EXPORTS;
}

/**
 * La sauvegarde complète, en JSON.
 *
 * Elle prend tout, table par table, sans mise en forme : ce n'est pas un
 * document à lire mais un fichier à relire. Les identifiants sont conservés —
 * sans eux, rien ne relierait une ligne de vente à sa vente.
 *
 * Elle est volontairement brute et non chiffrée : un fichier qu'on ne peut pas
 * ouvrir sans l'application qui l'a produit n'est pas une sauvegarde. Le gérant
 * doit donc la ranger comme il rangerait son cahier.
 */
export async function backup(session: Session): Promise<Record<string, unknown>> {
  const sql = getSql();
  const id = session.businessId;

  const boutique = one(await sql`SELECT * FROM businesses WHERE id = ${id}`) as Record<
    string,
    unknown
  > | null;
  if (!boutique) throw notFound('Boutique introuvable.');

  const [
    produits,
    conditionnements,
    clients,
    fournisseurs,
    ventes,
    lignesDeVente,
    encaissements,
    horsStock,
    commandes,
    lignesDeCommande,
    receptions,
    lignesDeReception,
    reglements,
    mouvements,
    depenses,
    recettes,
    membres,
  ] = await Promise.all([
    sql`SELECT * FROM products WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM product_units WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM customers WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM suppliers WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM sales WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM sale_items WHERE business_id = ${id} ORDER BY sale_id, position`,
    sql`SELECT * FROM payments WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM out_of_stock_sales WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM purchase_orders WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM purchase_order_items WHERE business_id = ${id} ORDER BY purchase_order_id, position`,
    sql`SELECT * FROM purchase_receipts WHERE business_id = ${id} ORDER BY received_at`,
    sql`SELECT * FROM purchase_receipt_items WHERE business_id = ${id} ORDER BY purchase_receipt_id`,
    sql`SELECT * FROM supplier_payments WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM stock_movements WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM expenses WHERE business_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM incomes WHERE business_id = ${id} ORDER BY created_at`,
    // Les membres sans leur mot de passe : une sauvegarde se range dans un
    // dossier « Téléchargements », pas dans un coffre.
    sql`
      SELECT u.id, u.name, u.email, u.phone, m.role, m.created_at
        FROM business_members m
        JOIN users u ON u.id = m.user_id
       WHERE m.business_id = ${id}
       ORDER BY m.created_at
    `,
  ]);

  return {
    format: 'maquincaillerie.sauvegarde',
    version: 1,
    exportedAt: new Date().toISOString(),
    business: boutique,
    products: produits,
    productUnits: conditionnements,
    customers: clients,
    suppliers: fournisseurs,
    sales: ventes,
    saleItems: lignesDeVente,
    payments: encaissements,
    outOfStockSales: horsStock,
    purchaseOrders: commandes,
    purchaseOrderItems: lignesDeCommande,
    purchaseReceipts: receptions,
    purchaseReceiptItems: lignesDeReception,
    supplierPayments: reglements,
    stockMovements: mouvements,
    expenses: depenses,
    incomes: recettes,
    members: membres,
  };
}
