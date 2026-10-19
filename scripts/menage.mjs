#!/usr/bin/env node
/**
 * Supprime des boutiques d'essai, et elles seules.
 *
 *   npm run menage -- "ZZ %"              liste ce qui serait supprimé
 *   npm run menage -- "ZZ %" --supprimer  supprime pour de bon
 *
 * Ce script existe parce que les recettes jouées contre la production laissent
 * derrière elles des boutiques jetables — « ZZ RECETTE … a supprimer » — et
 * qu'aucun écran ne permet d'effacer une boutique. Les laisser revient à faire
 * grossir indéfiniment la base avec des données qui ne sont à personne.
 *
 * Trois garde-fous, parce qu'un script qui efface des commerces doit être
 * ennuyeux à mal employer :
 *
 *   • le motif est obligatoire — rien n'est supprimé « par défaut » ;
 *   • sans `--supprimer`, il ne fait que lire et montrer, avec le détail de ce
 *     que chaque boutique contient ;
 *   • il refuse un motif qui attraperait tout (`%` seul), et refuse de tourner
 *     si le motif ne retient aucune boutique.
 *
 * La suppression d'une boutique emporte en cascade ses produits, ses ventes,
 * ses encaissements et ses mouvements de stock : les clés étrangères le disent
 * déjà (`ON DELETE CASCADE`), et c'est à elles qu'on fait confiance plutôt qu'à
 * une liste de DELETE recopiée ici, qui vieillirait mal.
 *
 * Les comptes restent : un utilisateur n'appartient pas à une boutique. On ne
 * supprime donc que ceux qui, après coup, ne sont plus membres d'aucune —
 * c'est-à-dire exactement les comptes créés pour la recette.
 */
import { neon } from '@neondatabase/serverless';

const motif = process.argv[2];
const pourDeVrai = process.argv.includes('--supprimer');

if (!motif || motif.trim() === '%' || motif.trim() === '') {
  console.error(
    'Usage : node scripts/menage.mjs "<motif LIKE>" [--supprimer]\n' +
      'Exemple : node scripts/menage.mjs "ZZ %" --supprimer\n' +
      'Le motif « % » seul est refusé : il viserait toutes les boutiques.'
  );
  process.exit(2);
}

const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
if (!url) {
  console.error('DATABASE_URL non configurée.');
  process.exit(2);
}

/** Neon en HTTP, tout le reste en TCP — même règle que l'application. */
async function connecter() {
  if (new URL(url).hostname.endsWith('.neon.tech')) {
    return { sql: neon(url), fermer: async () => {} };
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    sql: Object.assign(
      (textes, ...valeurs) => {
        const texte = textes.reduce((t, bout, i) => t + bout + (i < valeurs.length ? `$${i + 1}` : ''), '');
        return client.query(texte, valeurs).then((r) => r.rows);
      },
      { query: (t, p) => client.query(t, p).then((r) => r.rows) }
    ),
    fermer: () => client.end(),
  };
}

const { sql, fermer } = await connecter();

try {
  const boutiques = await sql`
    SELECT b.id, b.name, b.created_at::date AS creee_le,
           (SELECT COUNT(*) FROM sales s WHERE s.business_id = b.id)::int AS ventes,
           (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id)::int AS produits,
           (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id)::int AS clients,
           (SELECT COUNT(*) FROM business_members m WHERE m.business_id = b.id)::int AS membres
      FROM businesses b
     WHERE b.name LIKE ${motif}
     ORDER BY b.created_at
  `;

  if (boutiques.length === 0) {
    console.log(`Aucune boutique ne porte un nom comme « ${motif} ». Rien à faire.`);
    process.exit(0);
  }

  console.log(`${boutiques.length} boutique(s) retenue(s) par « ${motif} » :\n`);
  for (const b of boutiques) {
    console.log(
      `  ${b.name}\n` +
        `    créée le ${new Date(b.creee_le).toLocaleDateString('fr-FR')} · ` +
        `${b.produits} produits · ${b.ventes} ventes · ${b.clients} clients · ${b.membres} membre(s)`
    );
  }

  if (!pourDeVrai) {
    console.log('\nLecture seule. Ajoutez --supprimer pour effacer ces boutiques.');
    process.exit(0);
  }

  console.log('\nSuppression…');
  const ids = boutiques.map((b) => b.id);
  await sql.query(`DELETE FROM businesses WHERE id = ANY($1::text[])`, [ids]);

  // Les comptes devenus orphelins : plus membres d'aucune boutique. Un compte
  // qui tient encore une autre boutique n'est pas touché.
  const orphelins = await sql`
    DELETE FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM business_members m WHERE m.user_id = u.id)
     RETURNING u.email
  `;

  console.log(`${boutiques.length} boutique(s) supprimée(s).`);
  console.log(
    orphelins.length
      ? `${orphelins.length} compte(s) sans boutique supprimé(s) : ${orphelins.map((o) => o.email).join(', ')}`
      : 'Aucun compte orphelin.'
  );
} finally {
  await fermer();
}
