import { getSql, one } from './db';
import { ApiError } from './http';

/**
 * Freinage des tentatives de connexion (§34).
 *
 * Un formulaire de connexion ouvert sur Internet est essayé en masse : quelques
 * milliers de mots de passe courants suffisent à ouvrir un compte faible. bcrypt
 * rend chaque essai coûteux, mais ne l'interdit pas.
 *
 * Le comptage vit en base et non en mémoire : sur un hébergement sans état,
 * chaque instance garderait le sien et n'observerait qu'une fraction des essais.
 * Un compteur partagé est le seul qui compte réellement.
 *
 * Deux portées se cumulent. La première associe l'identifiant visé à l'adresse
 * d'origine : elle arrête celui qui s'acharne sur un compte, sans permettre à un
 * tiers malveillant d'enfermer dehors le commerçant lui-même — verrouiller un
 * identifiant depuis n'importe où serait une façon commode de fermer une
 * boutique. La seconde ne regarde que l'adresse, pour qu'une même machine ne
 * balaie pas le fichier des comptes ; elle est plus généreuse, car derrière un
 * partage de connexion plusieurs vendeurs sortent par la même adresse.
 */

const WINDOW_MINUTES = 15;
const LIMITS = { identifier: 8, ip: 40 };

/** Purge opportuniste : la fenêtre est courte, l'historique n'a aucune valeur. */
async function forget(sql) {
  await sql`
    DELETE FROM login_attempts
     WHERE attempted_at < now() - ${`${WINDOW_MINUTES * 4} minutes`}::interval
  `;
}

async function countRecent(sql, scope) {
  const row = one(
    await sql`
      SELECT count(*)::int AS n FROM login_attempts
       WHERE scope = ${scope}
         AND attempted_at > now() - ${`${WINDOW_MINUTES} minutes`}::interval
    `
  );
  return row.n;
}

/**
 * Portées à surveiller pour une tentative donnée.
 *
 * L'adresse est lue dans `x-forwarded-for`, dont seul le premier maillon est
 * renseigné par l'hébergeur ; le reste peut être forgé par l'appelant.
 */
function scopesOf(identifier, request) {
  const forwarded = request?.headers?.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim();
  const account = identifier ? identifier.toLowerCase() : '';
  const scopes = [];

  if (account) {
    // Sans adresse connue — proxy qui la retire, développement local — on
    // retombe sur l'identifiant seul : mieux vaut un verrouillage possible
    // qu'aucune protection du tout.
    scopes.push({ key: ip ? `id:${account}|ip:${ip}` : `id:${account}`, limit: LIMITS.identifier });
  }
  if (ip) scopes.push({ key: `ip:${ip}`, limit: LIMITS.ip });
  return scopes;
}

/**
 * Refuse la tentative si l'une des portées a déjà trop échoué.
 *
 * Le message ne distingue pas un compte existant d'un compte inconnu : le
 * blocage ne doit pas devenir un moyen de deviner qui a un compte ici.
 */
export async function guardLogin(identifier, request) {
  const sql = getSql();
  const scopes = scopesOf(identifier, request);
  for (const scope of scopes) {
    if ((await countRecent(sql, scope.key)) >= scope.limit) {
      throw new ApiError(
        429,
        `Trop de tentatives de connexion. Réessayez dans ${WINDOW_MINUTES} minutes.`
      );
    }
  }
}

/** Enregistre un échec. Une connexion réussie n'écrit rien. */
export async function recordFailedLogin(identifier, request) {
  const sql = getSql();
  const scopes = scopesOf(identifier, request);
  if (scopes.length === 0) return;
  await Promise.all([
    ...scopes.map((scope) => sql`INSERT INTO login_attempts (scope) VALUES (${scope.key})`),
    forget(sql),
  ]);
}
