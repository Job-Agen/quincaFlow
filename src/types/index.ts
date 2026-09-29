/**
 * Types partagés de QuincaFlow.
 *
 * Deux vocabulaires coexistent volontairement :
 *
 * — les **lignes de base** (`ProductRow`, `SaleRow`…) reprennent les noms de
 *   colonnes en `snake_case`, tels que Postgres les renvoie ;
 * — les **objets métier** (`Unit`, `PricedLine`…) sont en `camelCase`, calculés
 *   et manipulés côté application.
 *
 * Les garder distincts empêche l'erreur la plus fréquente de cette base de code :
 * lire `product.sellingPrice` sur une ligne qui porte `selling_price`, ce qui
 * produit `undefined`, donc un prix à zéro, donc une vente offerte.
 */

/** Montant en FCFA. Entier à l'affichage, décimal dans les calculs (§13). */
export type Money = number;

/** Quantité, jusqu'à trois décimales comme `numeric(14,3)`. */
export type Quantity = number;

/** Valeur brute arrivant d'un formulaire ou d'un corps de requête JSON. */
export type Input = unknown;

// ---------------------------------------------------------------------------
// Session et rôles (§5, §7)
// ---------------------------------------------------------------------------

export type Role = 'OWNER' | 'SELLER';

/** Teintes des badges et pastilles, définies dans globals.css. */
export type Tone = 'grey' | 'green' | 'amber' | 'red' | 'blue';

/**
 * Ce que porte le JWT, et rien de plus (§7).
 *
 * `name` sert uniquement à afficher qui a saisi une opération ; aucune décision
 * d'autorisation ne s'y appuie.
 */
export interface Session {
  userId: string;
  businessId: string;
  role: Role;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface BusinessRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tagline: string | null;
  currency: string;
}

/** Membre de la boutique, tel que l'écran Équipe le liste (§5). */
export interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  created_at: string;
}

export interface Profile {
  user: UserRow;
  business: BusinessRow;
  role: Role;
}

// ---------------------------------------------------------------------------
// Produits, conditionnements et stock (§9, §10, §26)
// ---------------------------------------------------------------------------

export interface ProductRow {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  base_unit: string;
  purchase_price: Money;
  selling_price: Money;
  stock_quantity: Quantity;
  low_stock_threshold: Quantity;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductUnitRow {
  id: string;
  business_id: string;
  product_id: string;
  label: string;
  factor: Quantity;
  price: Money;
  is_base: boolean;
}

/**
 * Produit et ses conditionnements, tels que l'API les renvoie.
 *
 * Les conditionnements sont déjà normalisés côté serveur : le client les utilise
 * tels quels. Les repasser par `unitsOf` remettrait leur drapeau « unité de
 * base » à faux, `Unit` portant `isBase` là où la ligne de base portait
 * `is_base`.
 */
export interface Product extends ProductRow {
  units: Unit[];
}

/** Conditionnement saisi dans un formulaire, avant d'exister en base. */
export interface UnitDraft {
  label: string;
  factor: Quantity;
  price: Money;
  isBase: boolean;
}

/** Entrée du catalogue chargé en bloc avant de chiffrer une vente ou un achat. */
export interface CatalogEntry {
  product: ProductRow;
  units: Unit[];
}

/** Conditionnement normalisé, tel que l'application le manipule. */
export interface Unit {
  id: string;
  label: string;
  factor: Quantity;
  price: Money;
  isBase: boolean;
}

/** Types de mouvements de stock (§26). */
export const STOCK_MOVEMENT_TYPES = [
  'SALE',
  'SALE_CANCEL',
  'PURCHASE_RECEIPT',
  'RETURN',
  'ADJUSTMENT',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovementRow {
  id: string;
  product_id: string;
  type: StockMovementType;
  quantity: Quantity;
  stock_after: Quantity;
  reference_type: string | null;
  reference_id: string | null;
  user_id: string | null;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Ventes (§11 à §15, §25)
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type SaleStatus = 'COMPLETED' | 'CANCELLED';

/** Ligne telle que le panier l'envoie : des identifiants et des quantités (§35). */
export interface SaleLineInput {
  productId: string;
  unitId?: string | null;
  /** Chaîne acceptée : le champ de quantité d'un formulaire en envoie une. */
  quantity: Quantity | string;
  /**
   * Prix négocié. Absent, `null` ou chaîne vide : on applique le tarif du
   * conditionnement. La chaîne vide compte, car c'est ce qu'un champ de saisie
   * laissé vide envoie — la traiter comme un nombre donnerait 0, donc un article
   * offert.
   */
  unitPrice?: Money | string | null;
}

/** Ligne chiffrée par le serveur — la seule qui fasse foi (§35). */
export interface PricedLine {
  productId: string;
  productName: string;
  unitLabel: string;
  /** Unités de base contenues dans un conditionnement vendu (§10). */
  unitFactor: Quantity;
  /** Quantité exprimée en conditionnements — 2 cartons, non 80 pièces. */
  quantity: Quantity;
  unitPrice: Money;
  lineTotal: Money;
  unitCost: Money;
  /** La même ligne ramenée à l'unité de base : ce qui sort réellement du stock. */
  baseQuantity: Quantity;
  lineCost: Money;
}

export interface SaleTotals {
  subtotal: Money;
  discount: Money;
  total: Money;
  costOfGoods: Money;
}

export interface SaleRow {
  id: string;
  business_id: string;
  reference: string;
  invoice_reference: string;
  customer_id: string | null;
  customer_name: string | null;
  user_id: string | null;
  subtotal: Money;
  discount: Money;
  total: Money;
  cost_of_goods: Money;
  payment_method: PaymentMethod;
  amount_paid: Money;
  payment_status: PaymentStatus;
  status: SaleStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_label: string;
  unit_factor: Quantity;
  quantity: Quantity;
  unit_price: Money;
  line_total: Money;
  unit_cost: Money;
}

export interface Sale extends SaleRow {
  items: SaleItemRow[];
}

// ---------------------------------------------------------------------------
// Vente hors stock (§16, §17)
// ---------------------------------------------------------------------------

export const OOS_STATUSES = [
  'TO_SOURCE',
  'SOURCED',
  'CUSTOMER_PAID',
  'SELLER_PAID',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OutOfStockStatus = (typeof OOS_STATUSES)[number];

export interface OutOfStockRow {
  id: string;
  business_id: string;
  reference: string;
  product_id: string | null;
  product_name: string;
  other_seller: string | null;
  customer_id: string | null;
  customer_name: string | null;
  quantity: Quantity;
  cost_price: Money;
  selling_price: Money;
  /** Marge figée à l'enregistrement : quantité × (prix client − coût) (§16). */
  gross_margin: Money;
  status: OutOfStockStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Achats fournisseurs (§19 à §22)
// ---------------------------------------------------------------------------

export const PO_STATUSES = [
  'DRAFT',
  'SENT',
  'INVOICE_RECEIVED',
  'PAID',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export interface PurchaseOrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_label: string;
  unit_factor: Quantity;
  quantity_ordered: Quantity;
  quantity_received: Quantity;
  unit_cost: Money;
  line_total: Money;
}

export interface PurchaseOrderRow {
  id: string;
  business_id: string;
  reference: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: PurchaseOrderStatus;
  total_estimated: Money;
  /** La colonne s'appelle `notes` au pluriel, contrairement aux ventes. */
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseReceiptRow {
  id: string;
  reference: string;
  notes: string | null;
  received_at: string;
}

export interface DocumentRow {
  id: string;
  kind: string;
  name: string;
  url: string;
  created_at: string;
}

export interface PurchaseOrder extends PurchaseOrderRow {
  items: PurchaseOrderItemRow[];
  receipts: PurchaseReceiptRow[];
  documents: DocumentRow[];
}

// ---------------------------------------------------------------------------
// Répertoires (§18, §23)
// ---------------------------------------------------------------------------

export interface ContactRow {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  whatsapp?: string | null;
  address: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Historique (§24) et tableau de bord (§8)
// ---------------------------------------------------------------------------

export type HistoryKind = 'SALE' | 'OUT_OF_STOCK' | 'PURCHASE_ORDER' | 'RECEIPT';

export interface HistoryEntry {
  kind: HistoryKind;
  id: string;
  reference: string;
  created_at: string;
  amount: Money;
  party: string | null;
  status: string;
  payment_status: PaymentStatus | null;
}

/** Les cinq indicateurs du tableau de bord, dans l'ordre du PRD (§8). */
export interface DashboardSummary {
  revenue: Money;
  margin: Money;
  salesCount: number;
  outOfStockCount: number;
  outOfStockRevenue: Money;
  lowStockCount: number;
  lowStock: ProductRow[];
  recent: HistoryEntry[];
}
