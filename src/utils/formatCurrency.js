/**
 * Format a number as currency (FCFA / XOF style).
 * e.g. 15000 → "15 000 FCFA"
 */
export function fmt(value) {
  if (value === null || value === undefined || isNaN(value)) return '0 FCFA';
  return (
    Number(value).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + ' FCFA'
  );
}
