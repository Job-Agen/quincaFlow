import storage from '../storage';

let cachedCurrency = null;

function getCurrency() {
  if (cachedCurrency) return cachedCurrency;
  const settings = storage.get('qp_settings', null);
  cachedCurrency = (settings && settings.currency) || 'FCFA';
  return cachedCurrency;
}

/** Met à jour la devise en cache (appelé par useSettings lors d'un changement). */
export function setCurrency(currency) {
  cachedCurrency = currency || 'FCFA';
}

/**
 * Format a number as currency using the configured currency (default FCFA).
 * e.g. 15000 → "15 000 FCFA"
 */
export function fmt(value) {
  const currency = getCurrency();
  if (value === null || value === undefined || isNaN(value)) return `0 ${currency}`;
  return (
    Number(value).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) +
    ' ' +
    currency
  );
}
