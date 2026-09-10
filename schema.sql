-- QuincaFlow — schéma Neon Serverless Postgres (MVP 1.0)
--
-- SaaS multi-tenant : à deux exceptions près (`users`, `refresh_tokens`), chaque
-- table métier porte un `business_id`. Aucune requête applicative ne doit lire une
-- ligne sans filtrer dessus — c'est la frontière entre deux quincailleries.
--
-- Les identifiants sont des `text` générés côté application (crypto.randomUUID).
-- Le pilote HTTP Neon exécute une transaction comme un tableau de requêtes qu'il
-- ne peut pas chaîner : connaître les identifiants avant d'écrire est ce qui
-- permet d'insérer une vente et ses lignes dans une seule transaction atomique.
--
-- Les montants sont en numeric(14,2) : le FCFA s'affiche sans décimale mais un
-- prix unitaire ramené à la pièce en produit (12 750 / 40 = 318,75).

-- ─────────────────────────── Comptes & boutiques ───────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  phone         text,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- L'identifiant de connexion peut être l'e-mail ou le téléphone (§7) : l'unicité
-- du téléphone est donc requise, mais seulement lorsqu'il est renseigné.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS businesses (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  phone      text,
  address    text,
  tagline    text,
  currency   text NOT NULL DEFAULT 'FCFA',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rôles MVP : OWNER, SELLER (§5). Pas de RBAC fin en V1.
CREATE TABLE IF NOT EXISTS business_members (
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'SELLER',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS business_members_user_idx ON business_members (user_id);

-- Refresh tokens : stockés hachés, révocables, expirables (§34).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Compteurs de références par boutique : VE-0001, FA-2026-0001, PO-0042…
-- Incrémentés par un UPDATE … RETURNING atomique, hors transaction métier :
-- un rollback laisse un trou dans la numérotation, ce qui est sans conséquence.
CREATE TABLE IF NOT EXISTS counters (
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind        text NOT NULL,
  value       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, kind)
);

-- ────────────────────────────── Catalogue ──────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                   text PRIMARY KEY,
  business_id          text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name                 text NOT NULL,
  sku                  text,
  description          text,
  base_unit            text NOT NULL DEFAULT 'pièce',
  purchase_price       numeric(14, 2) NOT NULL DEFAULT 0,
  selling_price        numeric(14, 2) NOT NULL DEFAULT 0,
  -- Stock unique, compté en unité de base (§10). La contrainte est la garde
  -- ultime contre la survente : une transaction qui ferait passer un stock sous
  -- zéro est rejetée par Postgres, quel que soit le chemin applicatif.
  stock_quantity       numeric(14, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold  numeric(14, 3) NOT NULL DEFAULT 0,
  -- Archivage plutôt que suppression : un produit déjà vendu ne doit pas
  -- disparaître de l'historique comptable (§9).
  archived             boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_business_idx ON products (business_id, archived);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key
  ON products (business_id, lower(sku)) WHERE sku IS NOT NULL AND sku <> '';

-- Conditionnements (§10). `factor` = nombre d'unités de base contenues.
-- L'unité de base elle-même est une ligne de facteur 1 (is_base).
CREATE TABLE IF NOT EXISTS product_units (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  product_id  text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  label       text NOT NULL,
  factor      numeric(14, 3) NOT NULL CHECK (factor > 0),
  price       numeric(14, 2) NOT NULL DEFAULT 0,
  is_base     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_units_product_idx ON product_units (product_id);

CREATE TABLE IF NOT EXISTS customers (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_business_idx ON customers (business_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  whatsapp    text,
  address     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_business_idx ON suppliers (business_id);

-- ──────────────────────────────── Ventes ───────────────────────────────────

CREATE TABLE IF NOT EXISTS sales (
  id             text PRIMARY KEY,
  business_id    text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  reference      text NOT NULL,
  customer_id    text REFERENCES customers (id) ON DELETE SET NULL,
  customer_name  text,
  user_id        text REFERENCES users (id) ON DELETE SET NULL,
  subtotal       numeric(14, 2) NOT NULL DEFAULT 0,
  discount       numeric(14, 2) NOT NULL DEFAULT 0,
  total          numeric(14, 2) NOT NULL DEFAULT 0,
  -- Coût des marchandises vendues, figé à la vente : le prix d'achat du produit
  -- bougera, la marge historique de cette vente, non.
  cost_of_goods  numeric(14, 2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'CASH',
  amount_paid    numeric(14, 2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'PAID',
  status         text NOT NULL DEFAULT 'COMPLETED',
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, reference)
);

CREATE INDEX IF NOT EXISTS sales_business_date_idx ON sales (business_id, created_at DESC);

-- Les libellés produit/unité sont dénormalisés : renommer un produit ne doit pas
-- réécrire les factures déjà imprimées.
CREATE TABLE IF NOT EXISTS sale_items (
  id           text PRIMARY KEY,
  business_id  text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  sale_id      text NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  product_id   text REFERENCES products (id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_label   text NOT NULL,
  unit_factor  numeric(14, 3) NOT NULL DEFAULT 1,
  quantity     numeric(14, 3) NOT NULL,
  unit_price   numeric(14, 2) NOT NULL,
  line_total   numeric(14, 2) NOT NULL,
  unit_cost    numeric(14, 2) NOT NULL DEFAULT 0,
  position     integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);

CREATE TABLE IF NOT EXISTS payments (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  sale_id     text REFERENCES sales (id) ON DELETE CASCADE,
  method      text NOT NULL DEFAULT 'CASH',
  amount      numeric(14, 2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_sale_idx ON payments (sale_id);

-- ────────────────────────── Ventes hors stock (§16) ────────────────────────
--
-- Le produit est acheté chez un confrère pour satisfaire une demande précise.
-- Il ne transite jamais par le stock : aucun mouvement n'est créé ici (§17).

CREATE TABLE IF NOT EXISTS out_of_stock_sales (
  id             text PRIMARY KEY,
  business_id    text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  reference      text NOT NULL,
  customer_id    text REFERENCES customers (id) ON DELETE SET NULL,
  customer_name  text,
  product_id     text REFERENCES products (id) ON DELETE SET NULL,
  product_name   text NOT NULL,
  other_seller   text,
  quantity       numeric(14, 3) NOT NULL DEFAULT 1,
  cost_price     numeric(14, 2) NOT NULL DEFAULT 0,
  selling_price  numeric(14, 2) NOT NULL DEFAULT 0,
  gross_margin   numeric(14, 2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'TO_SOURCE',
  note           text,
  user_id        text REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, reference)
);

CREATE INDEX IF NOT EXISTS oos_business_date_idx ON out_of_stock_sales (business_id, created_at DESC);

-- ─────────────────────── Commandes fournisseurs (§19-22) ───────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            text PRIMARY KEY,
  business_id   text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  reference     text NOT NULL,
  supplier_id   text REFERENCES suppliers (id) ON DELETE SET NULL,
  supplier_name text,
  status        text NOT NULL DEFAULT 'DRAFT',
  total_estimated numeric(14, 2) NOT NULL DEFAULT 0,
  notes         text,
  user_id       text REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, reference)
);

CREATE INDEX IF NOT EXISTS po_business_date_idx ON purchase_orders (business_id, created_at DESC);

-- `quantity_received` ≤ `quantity_ordered` : la livraison partielle (§22) est
-- prévue dès la conception plutôt que rajoutée après coup.
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                text PRIMARY KEY,
  business_id       text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  purchase_order_id text NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  product_id        text REFERENCES products (id) ON DELETE SET NULL,
  product_name      text NOT NULL,
  unit_label        text NOT NULL DEFAULT 'pièce',
  unit_factor       numeric(14, 3) NOT NULL DEFAULT 1,
  quantity_ordered  numeric(14, 3) NOT NULL,
  quantity_received numeric(14, 3) NOT NULL DEFAULT 0,
  unit_cost         numeric(14, 2) NOT NULL DEFAULT 0,
  position          integer NOT NULL DEFAULT 0,
  CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered)
);

CREATE INDEX IF NOT EXISTS po_items_order_idx ON purchase_order_items (purchase_order_id);

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id                text PRIMARY KEY,
  business_id       text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  purchase_order_id text NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  reference         text NOT NULL,
  notes             text,
  user_id           text REFERENCES users (id) ON DELETE SET NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, reference)
);

CREATE INDEX IF NOT EXISTS receipts_order_idx ON purchase_receipts (purchase_order_id);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
  id                     text PRIMARY KEY,
  business_id            text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  purchase_receipt_id    text NOT NULL REFERENCES purchase_receipts (id) ON DELETE CASCADE,
  purchase_order_item_id text NOT NULL REFERENCES purchase_order_items (id) ON DELETE CASCADE,
  product_id             text REFERENCES products (id) ON DELETE SET NULL,
  quantity               numeric(14, 3) NOT NULL,
  unit_cost              numeric(14, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS receipt_items_receipt_idx ON purchase_receipt_items (purchase_receipt_id);

-- ───────────────────────── Mouvements de stock (§26) ───────────────────────
--
-- `products.stock_quantity` est un cache : ce journal est ce qui explique
-- pourquoi le stock est passé de 50 à 37. `quantity` est signée, exprimée en
-- unité de base, et `stock_after` fige l'état résultant.

CREATE TABLE IF NOT EXISTS stock_movements (
  id             text PRIMARY KEY,
  business_id    text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  product_id     text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  type           text NOT NULL,
  quantity       numeric(14, 3) NOT NULL,
  stock_after    numeric(14, 3),
  reference_type text,
  reference_id   text,
  user_id        text REFERENCES users (id) ON DELETE SET NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movements_product_idx ON stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS movements_business_idx ON stock_movements (business_id, created_at DESC);

-- Pièces jointes d'une commande : bon de commande, facture fournisseur,
-- preuve de paiement (§20).
CREATE TABLE IF NOT EXISTS documents (
  id             text PRIMARY KEY,
  business_id    text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind           text NOT NULL,
  reference_type text NOT NULL,
  reference_id   text NOT NULL,
  name           text NOT NULL,
  url            text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_ref_idx ON documents (business_id, reference_type, reference_id);
