import { neon, type NeonQueryFunction, type NeonQueryPromise } from '@neondatabase/serverless';
import { ApiError } from './http';

/**
 * Accès Neon Serverless Postgres.
 *
 * Le pilote HTTP est utilisé partout, y compris pour les transactions :
 * `sql.transaction([...])` envoie un tableau de requêtes exécutées en un seul
 * BEGIN/COMMIT côté Neon. Il est *non interactif* — aucune requête du tableau ne
 * peut consommer le résultat d'une autre. C'est pourquoi les identifiants sont
 * générés côté application (voir `ids.js`) : connaître l'id d'une vente avant de
 * l'insérer est ce qui permet d'écrire la vente, ses lignes, son paiement et ses
 * mouvements de stock dans la même transaction.
 */

function databaseUrl(): string {
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
}

/** Vrai si la base est configurée. Sans elle, l'application ne peut pas servir. */
export function isDbConfigured(): boolean {
  return Boolean(databaseUrl());
}

/** Client SQL tel que l'application l'utilise : des lignes en objets. */
export type Sql = NeonQueryFunction<false, false>;

/** Requête préparée par le tagged template, prête à entrer en transaction. */
export type Query = NeonQueryPromise<false, false, Record<string, unknown>[]>;

let cached: { url: string; sql: Sql } | null = null;

/**
 * Client SQL Neon, en tagged template : sql`SELECT … WHERE id = ${id}`.
 * Les valeurs interpolées sont toujours envoyées en paramètres liés, jamais
 * concaténées — c'est la protection contre l'injection SQL (§34).
 */
export function getSql(): Sql {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL non configurée. Renseignez la chaîne de connexion Neon dans .env.local.'
    );
  }
  if (!cached || cached.url !== url) {
    cached = { url, sql: neon(url) };
  }
  return cached.sql;
}

/**
 * Exécute un tableau de requêtes dans une transaction atomique et traduit les
 * violations de contrainte en erreurs métier lisibles.
 *
 * Si l'une des requêtes échoue, rien n'est écrit (§12) : on n'obtient jamais une
 * vente enregistrée dont le stock n'aurait pas bougé. Deux contraintes portent
 * ici une règle métier et non un bug — `stock_quantity >= 0` (survente) et
 * l'unicité des références.
 */
export async function runTransaction(queries: Query[]): Promise<unknown> {
  try {
    return await getSql().transaction(queries);
  } catch (rawError) {
    // Le pilote remonte une erreur Postgres brute, pas une `Error` typée : on ne
    // lit `code` et `message` qu'après avoir nommé la forme attendue.
    const error = rawError as { code?: string; message?: string } | null;
    const message = String(error?.message || '');
    if (error?.code === '23514' && message.includes('stock_quantity')) {
      throw new ApiError(409, "Stock insuffisant : la vente n'a pas été enregistrée.");
    }
    // `purchase_order_items` couvre les bases créées avant que la contrainte ne
    // soit nommée : anonyme, elle s'appelle `purchase_order_items_check` et le
    // seul test sur `quantity_received` ne rattrapait rien.
    if (error?.code === '23514' && /quantity_received|purchase_order_items/.test(message)) {
      throw new ApiError(409, 'Quantité reçue supérieure à la quantité commandée.');
    }
    if (error?.code === '23505') {
      throw new ApiError(409, 'Cette référence est déjà utilisée.');
    }
    throw rawError;
  }
}

/**
 * Première ligne d'un résultat, ou `null`.
 *
 * Générique : l'appelant déclare la forme qu'il attend, et le reste du code la
 * reçoit typée plutôt que sous forme d'enregistrement anonyme.
 */
export function one<T>(rows: readonly unknown[] | null | undefined): T | null {
  return rows && rows.length > 0 ? (rows[0] as T) : null;
}

/**
 * Toutes les lignes d'un résultat, dans la forme déclarée par l'appelant.
 *
 * Le pilote rend des enregistrements anonymes ; c'est ici, et nulle part
 * ailleurs, que l'application leur donne un nom. Concentrer la conversion en un
 * point unique évite qu'un `as` traîne dans chaque requête — et laisse un seul
 * endroit à corriger le jour où le pilote sait typer ses résultats.
 */
export function rows<T>(result: readonly unknown[] | null | undefined): T[] {
  return (result ?? []) as T[];
}
