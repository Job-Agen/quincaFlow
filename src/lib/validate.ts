import { badRequest } from './http';
import { toNumber } from '../utils/money';

/**
 * Validation des entrées d'API.
 *
 * Le frontend n'est jamais la source de vérité (§35) : les montants, les
 * quantités et les statuts sont revalidés ici avant d'atteindre la base.
 */

/**
 * Chaîne nettoyée, ou `null` pour un champ facultatif laissé vide.
 *
 * Les surcharges disent ce que le code faisait déjà : un champ obligatoire ne
 * rend jamais `null`, puisque son absence lève. Sans elles, chaque appelant
 * devrait écarter un `null` qui ne peut pas se produire — et finirait par le
 * faire avec un `!` qui masquerait les cas où il peut, lui, réellement arriver.
 */
export function str(
  value: unknown,
  field: string,
  options?: { required?: true; max?: number }
): string;
export function str(
  value: unknown,
  field: string,
  options: { required: false; max?: number }
): string | null;
export function str(
  value: unknown,
  field: string,
  { required = true, max = 300 }: { required?: boolean; max?: number } = {}
): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    if (required) throw badRequest(`Le champ « ${field} » est obligatoire.`);
    return null;
  }
  if (trimmed.length > max) throw badRequest(`Le champ « ${field} » est trop long.`);
  return trimmed;
}

export function num(
  value: unknown,
  field: string,
  { min = 0, max = 1e12, required = true }: { min?: number; max?: number; required?: boolean } = {}
): number {
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

export function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw badRequest(`Valeur invalide pour « ${field} ».`);
  }
  return value as T;
}

export function list(
  value: unknown,
  field: string,
  { min = 1, max = 200 }: { min?: number; max?: number } = {}
): unknown[] {
  if (!Array.isArray(value) || value.length < min) {
    throw badRequest(`Le champ « ${field} » doit contenir au moins ${min} élément(s).`);
  }
  if (value.length > max) throw badRequest(`Le champ « ${field} » contient trop d'éléments.`);
  return value;
}

/** Adresse e-mail — validation volontairement permissive. */
export function email(value: unknown, field = 'e-mail'): string {
  const trimmed = str(value, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw badRequest('Adresse e-mail invalide.');
  }
  return trimmed;
}
