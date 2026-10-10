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

/**
 * Jetons rendus dans le corps à un client natif (§41).
 *
 * Absents de toute réponse au navigateur, qui les reçoit en cookies `HttpOnly` :
 * les rendre lisibles par le JavaScript de la page mettrait la session à portée
 * d'un script injecté, ce que les cookies évitent précisément.
 */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** Secondes de validité de l'access token : le client sait quand renouveler. */
  expiresIn: number;
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

// ---------------------------------------------------------------------------
// Dépenses et rapports financiers (§39)
// ---------------------------------------------------------------------------

/** Les six postes de dépense d'une quincaillerie (§40). */
export type ExpenseCategory =
  | 'RENT'
  | 'UTILITIES'
  | 'SALARY'
  | 'STOCK_PURCHASE'
  | 'TRANSPORT'
  | 'OTHER';

export interface ExpenseRow {
  id: string;
  business_id: string;
  category: ExpenseCategory;
  label: string;
  amount: Money;
  /** Date de sortie de l'argent, au format `YYYY-MM-DD` — pas celle de la saisie. */
  spent_on: string;
  note: string | null;
  user_id: string | null;
  created_at: string;
  /**
   * Un justificatif est joint (§40).
   *
   * L'image elle-même n'est pas ici : une liste de trente dépenses porterait
   * trente photos, soit plusieurs mégaoctets sur une connexion de comptoir. Elle
   * se demande à l'ouverture de la dépense, par `/api/expenses/:id/receipt`.
   */
  has_receipt: boolean;
}

/** Justificatif d'une dépense, image comprise : chargé à l'unité (§40). */
export interface Receipt {
  id: string;
  name: string;
  /** Image en `data:` URL, réduite côté téléphone avant l'envoi. */
  url: string;
  created_at: string;
}

/** Total d'un poste de dépense sur la période. */
export interface ExpenseBucket {
  category: ExpenseCategory;
  amount: Money;
  count: number;
}

// ---------------------------------------------------------------------------
// Cahier de recettes (§42)
// ---------------------------------------------------------------------------

/** Les cinq postes d'une recette hors vente (§42). */
export type IncomeCategory = 'SERVICE' | 'DELIVERY' | 'RENTAL' | 'DEBT_REPAYMENT' | 'OTHER';

export interface IncomeRow {
  id: string;
  business_id: string;
  category: IncomeCategory;
  label: string;
  amount: Money;
  /** Date d'entrée de l'argent, au format `YYYY-MM-DD` — pas celle de la saisie. */
  received_on: string;
  note: string | null;
  user_id: string | null;
  created_at: string;
}

/** Total d'un poste de recette sur la période. */
export interface IncomeBucket {
  category: IncomeCategory;
  amount: Money;
  count: number;
}

/**
 * Une journée du cahier (§42).
 *
 * `total` est la somme des deux origines. Les garder séparées est ce qui permet
 * au gérant de voir d'où vient sa journée : vingt mille de ventes et rien
 * d'autre ne se lit pas comme vingt mille dont quinze de location.
 */
export interface TakingsDay {
  /** Jour au format `YYYY-MM-DD`. */
  day: string;
  salesAmount: Money;
  salesCount: number;
  otherAmount: Money;
  otherCount: number;
  total: Money;
}

/** Le cahier de recettes d'une période (§42). */
export interface TakingsBook {
  from: string | null;
  to: string | null;
  /** Encaissements de vente de la période (§14). */
  salesTotal: Money;
  /** Recettes hors vente, tous postes confondus. */
  otherTotal: Money;
  /** La part des recettes hors vente qui est du chiffre d'affaires (§42). */
  otherRevenue: Money;
  total: Money;
  days: TakingsDay[];
  byCategory: IncomeBucket[];
}

/**
 * Résultat d'une période, du chiffre d'affaires au bénéfice net (§39).
 *
 * `marginRate` est `null` quand rien n'a été vendu : afficher 0 % laisserait
 * croire à une vente sans marge.
 */
export interface PeriodTotals {
  revenue: Money;
  salesRevenue: Money;
  outOfStockRevenue: Money;
  /** Recettes hors vente qui comptent comme chiffre d'affaires (§42). */
  otherRevenue: Money;
  costOfGoods: Money;
  grossMargin: Money;
  marginRate: number | null;
  /** Tout ce qui est sorti de la caisse en dépenses sur la période (§40). */
  expenses: Money;
  /** La part « achat de stock » : sortie de caisse, mais pas une charge (§39). */
  stockPurchases: Money;
  /** Les dépenses réellement déduites du bénéfice : `expenses − stockPurchases`. */
  operatingExpenses: Money;
  netProfit: Money;
}

/** Une tranche du rapport des ventes par période : un jour, ou un mois. */
export interface PeriodBucket {
  /** Début de la tranche, en ISO — le libellé est mis en forme à l'affichage. */
  bucket: string;
  salesCount: number;
  outOfStockCount: number;
  revenue: Money;
  cost: Money;
  margin: Money;
}

/** Découpage du rapport : par jour jusqu'à trois mois, par mois au-delà. */
export type Granularity = 'day' | 'month';

/**
 * Rentabilité d'un produit sur la période (§39).
 *
 * `quantity` est en unité de base (§10) ; la quantité hors stock est comptée à
 * part, l'article n'étant jamais entré en stock.
 */
export interface ProductProfit {
  productId: string | null;
  productName: string;
  baseUnit: string | null;
  quantity: Quantity;
  revenue: Money;
  cost: Money;
  margin: Money;
  marginRate: number | null;
  outOfStockQuantity: Quantity;
  outOfStockRevenue: Money;
  outOfStockMargin: Money;
}

/** Tout ce que l'écran Rapports affiche, en un seul aller-retour (§35). */
export interface FinancialReport {
  from: string | null;
  to: string | null;
  granularity: Granularity;
  totals: PeriodTotals;
  salesCount: number;
  outOfStockCount: number;
  /** Nombre de dépenses composant le total : zéro veut dire « marge brute ». */
  expenseCount: number;
  expensesByCategory: ExpenseBucket[];
  buckets: PeriodBucket[];
  products: ProductProfit[];
  /** Produits vendus sur la période ; `products` peut en montrer moins (§39). */
  productCount: number;
}

// ---------------------------------------------------------------------------
// Journal de caisse (§40)
// ---------------------------------------------------------------------------

/**
 * Une ligne du journal de caisse.
 *
 * `amount` est toujours positif ; c'est `direction` qui dit le sens. Une colonne
 * signée obligerait chaque lecteur à se souvenir de la convention, et un total
 * d'entrées calculé sur des montants signés donnerait la différence au lieu de
 * la somme.
 */
export interface CashEntry {
  id: string;
  direction: 'IN' | 'OUT';
  /** `SALE_PAYMENT` encaissement de vente, `INCOME` recette hors vente (§42), `EXPENSE` dépense. */
  kind: 'SALE_PAYMENT' | 'INCOME' | 'EXPENSE';
  occurredAt: string;
  label: string;
  /** Moyen de paiement pour une entrée, poste de dépense pour une sortie. */
  detail: string;
  amount: Money;
  /** Référence de la vente, pour ouvrir le reçu depuis le journal. */
  reference: string | null;
  saleId: string | null;
}

/** Une ligne du journal, accompagnée du solde après son passage. */
export interface CashEntryWithBalance extends CashEntry {
  balance: Money;
}

/**
 * Journal de caisse d'une période (§40).
 *
 * `balance` est le solde des opérations de la période, non le fond de caisse :
 * aucun solde d'ouverture n'est demandé en V1, et l'écran doit le dire plutôt
 * que de laisser croire au contenu réel du tiroir.
 */
export interface CashJournal {
  from: string | null;
  to: string | null;
  cashIn: Money;
  cashOut: Money;
  balance: Money;
  entries: CashEntryWithBalance[];
  /** Vrai si la période compte plus de lignes que le journal n'en rapporte. */
  truncated: boolean;
}
