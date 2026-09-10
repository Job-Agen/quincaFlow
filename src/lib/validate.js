import { badRequest } from './http';
import { toNumber } from '../utils/money';

/**
 * Validation des entrées d'API.
 *
 * Le frontend n'est jamais la source de vérité (§35) : les montants, les
 * quantités et les statuts sont revalidés ici avant d'atteindre la base.
 */

export function str(value, field, { required = true, max = 300 } = {}) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    if (required) throw badRequest(`Le champ « ${field} » est obligatoire.`);
    return null;
  }
  if (trimmed.length > max) throw badRequest(`Le champ « ${field} » est trop long.`);
  return trimmed;
}

export function num(value, field, { min = 0, max = 1e12, required = true } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw badRequest(`Le champ « ${field} » est obligatoire.`);
    return 0;
  }
  const parsed = toNumber(value, NaN);
  if (!Number.isFinite(parsed)) throw badRequest(`Le champ « ${field} » doit être un nombre.`);
  if (parsed < min) throw badRequest(`Le champ « ${field} » doit être au moins ${min}.`);
  if (parsed > max) throw badRequest(`Le champ « ${field} » est hors limites.`);
  return parsed;
}

export function enumValue(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw badRequest(`Valeur invalide pour « ${field} ».`);
  }
  return value;
}

export function list(value, field, { min = 1, max = 200 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    throw badRequest(`Le champ « ${field} » doit contenir au moins ${min} élément(s).`);
  }
  if (value.length > max) throw badRequest(`Le champ « ${field} » contient trop d'éléments.`);
  return value;
}

/** Adresse e-mail — validation volontairement permissive. */
export function email(value, field = 'e-mail') {
  const trimmed = str(value, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw badRequest('Adresse e-mail invalide.');
  }
  return trimmed;
}
