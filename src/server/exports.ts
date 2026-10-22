import { getSql, one, rows } from '../lib/db';
import { notFound } from '../lib/http';
import { round2 } from '../utils/money';
import { marginRate } from '../domain/report';
import { isLowStock, isOutOfStock } from '../domain/stock';
import { toCsv, type CsvColumn } from '../domain/csv';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../domain/sale';
import type { PaymentMethod, PaymentStatus, Session } from '@/types';

/**
 * Exports comptables et sauvegarde (§48).
 *
 * Le gérant n'est pas le seul à regarder ses chiffres : il y a le comptable en
 * fin d'exercice, l'associé, parfois la banque. Aucun d'eux n'ouvrira
 * l'application — ils veulent un fichier. Jusqu'ici il n'y avait aucun moyen
 * d'en sortir un, et des années de ventes étaient prisonnières de l'écran.
 *
 * Trois fichiers, parce que ce sont trois questions distinctes : ce que je
 * détiens, ce que j'ai vendu, ce qu'on me doit. Un seul fichier qui les
 * mélangerait obligerait à les démêler dans le tableur.
 *
 * Et une sauvegarde JSON, qui n'est pas un export comptable mais un filet :
 * tout ce que la boutique contient, dans un seul fichier, relisible par une
 * machine. C'est ce qu'on garde avant de fermer une boutique (§46), et ce qu'on
 * emporte si l'on quitte un jour ce logiciel.
 */

interface LigneStock {
  sku: string | null;
  name: string;
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
      SELECT p.sku, p.name, p.base_unit,
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
             s.payment_method, s.payment_status,
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
  { title: 'Règlement', value: (l) => PAYMENT_METHOD_LABELS[l.payment_method] ?? l.payment_method },
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

/** Les trois exports, par leur nom d'adresse. */
export const EXPORTS = {
  stocks: async (businessId: string) => toCsv(await stocksRows(businessId), COLONNES_STOCK),
  ventes: async (businessId: string) => toCsv(await salesRows(businessId), COLONNES_VENTES),
  clients: async (businessId: string) => toCsv(await customersRows(businessId), COLONNES_CLIENTS),
} as const;

export type ExportKind = keyof typeof EXPORTS;

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
    stockMovements: mouvements,
    expenses: depenses,
    incomes: recettes,
    members: membres,
  };
}
