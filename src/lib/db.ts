import { neon, type NeonQueryFunction, type NeonQueryPromise } from '@neondatabase/serverless';
import { ApiError } from './http';
import { createNeonOverPg } from './postgres';

/**
 * Accès Postgres.
 *
 * `DATABASE_URL` décide du pilote : une adresse Neon passe par le proxy HTTP de
 * `@neondatabase/serverless`, toute autre par `pg` en TCP (voir `postgres.ts`).
 * L'application ne voit qu'une interface, et le SQL envoyé est le même.
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
 * Vrai si l'adresse désigne une base Neon.
 *
 * Neon est le seul à parler le protocole HTTP de `@neondatabase/serverless` ;
 * tout le reste est un PostgreSQL ordinaire, qu'on joint en TCP. Le test porte
 * sur l'hôte et non sur le schéma d'URL, parce que les deux s'écrivent
 * `postgresql://`. `scripts/db.mjs` reconnaît ses bases de la même façon : une
 * seule règle, pour que le script de schéma et l'application ne puissent pas
 * aboutir à des conclusions différentes sur la même adresse.
 */
export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

/**
 * Client SQL Neon, en tagged template : sql`SELECT … WHERE id = ${id}`.
 * Les valeurs interpolées sont toujours envoyées en paramètres liés, jamais
 * concaténées — c'est la protection contre l'injection SQL (§34).
 */
export function getSql(): Sql {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL non configurée. Renseignez la chaîne de connexion Postgres dans .env.local.'
    );
  }
  if (!cached || cached.url !== url) {
    cached = { url, sql: driverFor(url) };
  }
  return cached.sql;
}

/**
 * Le pilote qui convient à l'adresse donnée.
 *
 * L'adaptateur `pg` n'a pas le type du pilote Neon : il n'en implémente que la
 * part utilisée, ce qui est le point. L'assertion est donc ici, à l'unique
 * frontière entre les deux, et nulle part ailleurs dans l'application — tout le
 * reste du code ne connaît que `Sql`.
 */
function driverFor(url: string): Sql {
  if (isNeonUrl(url)) return neon(url);
  return createNeonOverPg(url) as unknown as Sql;
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
