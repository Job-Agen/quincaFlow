import pg from 'pg';

/**
 * Adaptateur node-postgres présentant l'interface du pilote HTTP de Neon.
 *
 * `@neondatabase/serverless` ne parle qu'au proxy HTTP de Neon. Un PostgreSQL
 * ordinaire — celui d'un poste de développement, celui de la CI, celui d'un
 * autre hébergeur — ne le comprend pas. Cet adaptateur expose exactement les
 * trois capacités que l'application utilise — le tagged template, `unsafe()` et
 * `transaction()` — au-dessus de `pg`.
 *
 * Il sert deux usages, et c'est délibéré :
 *
 *   • les tests d'intégration, qui ont besoin d'un vrai Postgres ;
 *   • l'application elle-même, quand `DATABASE_URL` ne désigne pas Neon
 *     (voir `isNeonUrl` dans `db.ts`).
 *
 * La conséquence du premier usage est que le code testé est bien le code livré,
 * jusqu'au texte SQL envoyé. Celle du second est qu'on peut lancer
 * l'application en local, contre un Postgres de poste, sans secret de
 * production ni accès réseau — c'est ce qui a permis de vérifier la mise en
 * page sur écran large autrement qu'en déployant.
 */

/** Fragment interpolé tel quel, pour les listes de colonnes. */
class RawSql {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

/** Une requête assemblée, telle que `transaction()` la reçoit non exécutée. */
interface PreparedQuery {
  text: string;
  params: unknown[];
}

/**
 * Assemble le SQL paramétré.
 *
 * Chaque valeur devient un paramètre lié `$n` — jamais une concaténation. Seuls
 * les fragments produits par `unsafe()` sont insérés littéralement, comme dans
 * le pilote Neon.
 */
function build(strings: TemplateStringsArray, values: unknown[]): PreparedQuery {
  let text = '';
  const params: unknown[] = [];
  strings.forEach((chunk: string, index: number) => {
    text += chunk;
    if (index >= values.length) return;
    const value = values[index];
    if (value instanceof RawSql) {
      text += value.text;
    } else {
      params.push(value);
      text += `$${params.length}`;
    }
  });
  return { text, params };
}

export function createNeonOverPg(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 4 });

  function sql(strings: TemplateStringsArray, ...values: unknown[]) {
    const { text, params } = build(strings, values);
    // Objet « thenable » plutôt que promesse : `await` l'exécute, mais
    // `transaction()` peut aussi le recevoir non exécuté, comme chez Neon.
    return {
      text,
      params,
      then: (resolve: (rows: unknown[]) => void, reject: (error: unknown) => void) =>
        pool
          .query(text, params)
          .then((result) => result.rows)
          .then(resolve, reject),
    };
  }

  sql.unsafe = (text: string) => new RawSql(text);

  sql.transaction = async (queries: PreparedQuery[]) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results: unknown[][] = [];
      for (const query of queries) {
        results.push((await client.query(query.text, query.params)).rows);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  sql.end = () => pool.end();

  return sql;
}
