// Correspondance entre les clés localStorage (qp_*) et les tables Neon Postgres.
// kind: 'array'  -> la clé contient un tableau d'objets (une ligne par élément)
//       'object' -> la clé contient un objet unique (une seule ligne, id fixe)

export const SYNCED_KEYS = [
  { key: 'qp_products', table: 'products', kind: 'array' },
  { key: 'qp_contacts', table: 'contacts', kind: 'array' },
  { key: 'qp_sales', table: 'sales', kind: 'array' },
  { key: 'qp_expenses', table: 'expenses', kind: 'array' },
  { key: 'qp_invoices', table: 'invoices', kind: 'array' },
  { key: 'qp_stock_movements', table: 'stock_movements', kind: 'array' },
  { key: 'qp_purchases', table: 'purchases', kind: 'array' },
  { key: 'qp_credit_payments', table: 'credit_payments', kind: 'array' },
  { key: 'qp_settings', table: 'settings', kind: 'object' },
];

// id fixe de la ligne unique des paramètres
export const SETTINGS_ROW_ID = 'default';

export function getSyncedKeys() {
  return SYNCED_KEYS.map((s) => s.key);
}

export function configForKey(key) {
  return SYNCED_KEYS.find((s) => s.key === key) || null;
}

// --- Conversion des clés ---

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function snakeToCamel(str) {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Objet applicatif (camelCase) -> ligne Neon (snake_case). */
export function toRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    row[camelToSnake(k)] = v;
  }
  return row;
}

/** Ligne Neon (snake_case) -> objet applicatif (camelCase). */
export function fromRow(row) {
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id') continue;
    obj[snakeToCamel(k)] = v;
  }
  return obj;
}
