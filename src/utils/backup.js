import storage from '../storage';

/** Clés localStorage gérées par la sauvegarde. */
export const BACKUP_KEYS = [
  'qp_products',
  'qp_sales',
  'qp_expenses',
  'qp_contacts',
  'qp_invoices',
  'qp_settings',
  'qp_stock_movements',
  'qp_purchases',
  'qp_credit_payments',
];

/**
 * Exporte toutes les données de l'application.
 * @returns {{ version: number, exportedAt: string, data: Object }}
 */
export function exportAll() {
  const data = {};
  BACKUP_KEYS.forEach((key) => {
    data[key] = storage.get(key, null);
  });
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Importe une sauvegarde précédemment exportée via exportAll().
 * N'écrit que les clés connues (BACKUP_KEYS).
 * @param {object} obj - Objet de sauvegarde { version, data }
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function importAll(obj) {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Fichier de sauvegarde invalide.' };
  }
  if (obj.version !== 1) {
    return { ok: false, error: 'Version de sauvegarde non prise en charge.' };
  }
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    return { ok: false, error: 'Le fichier ne contient pas de données valides.' };
  }
  BACKUP_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj.data, key) && obj.data[key] !== null) {
      storage.set(key, obj.data[key]);
    }
  });
  return { ok: true };
}

/** Supprime toutes les données de l'application (clés qp_*). */
export function resetAll() {
  BACKUP_KEYS.forEach((key) => {
    storage.remove(key);
  });
}
