#!/usr/bin/env node
/**
 * Confronte la base de `DATABASE_URL` à `schema.sql`, et la met à niveau.
 *
 * Ce script existe pour une panne réelle : la production tournait sur une base
 * créée avant le §40, à qui ne manquait que la table `expenses`. Les écrans
 * Dépenses, Rapports et Journal de caisse répondaient 500 — un code sain sur une
 * base incomplète. Rien ne permettait de le voir sans lire les traces du
 * serveur, et rien ne permettait de le réparer sans rejouer le schéma à la main.
 *
 *   npm run db:check    dit ce qui manque, n'écrit rien
 *   npm run db:apply    crée ce qui manque, ne touche à rien d'existant
 *
 * `schema.sql` n'est fait que de `CREATE … IF NOT EXISTS` : le rejouer sur une
 * base déjà à jour ne fait rien, et sur une base en retard ne crée que le
 * manquant. Aucune donnée n'est lue, modifiée ni supprimée.
 *
 * Une réserve, et elle est importante : si la base porte une table du *même nom*
 * mais d'une *autre forme* — c'est le cas de l'ancienne base de QuincaFlow, dont
 * `users`, `products`, `sales`, `expenses` et `stock_movements` sont en
 * `id, user_id, data jsonb` —, `IF NOT EXISTS` la saute en silence.
 * `db:check` le dit, car il compare les colonnes et pas seulement les noms.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = join(RACINE, 'schema.sql');

/**
 * Découpe `schema.sql` en instructions.
 *
 * Le fichier ne contient ni point-virgule dans une chaîne littérale, ni bloc
 * `$$` : un découpage sur `;`, commentaires retirés, suffit et reste lisible.
 * `db:check` échouerait bruyamment si cette hypothèse cessait d'être vraie.
 */
function instructions(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((une) => une.trim())
    .filter(Boolean);
}

/** Les tables attendues, et pour chacune ses colonnes, lues depuis `schema.sql`. */
function attendu(sql) {
  const tables = new Map();
  const motif = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\)/g;
  for (const [, nom, corps] of sql.replace(/--[^\n]*/g, '').matchAll(motif)) {
    const colonnes = [];
    let profondeur = 0;
    let morceau = '';
    for (const caractere of corps) {
      if (caractere === '(') profondeur += 1;
      if (caractere === ')') profondeur -= 1;
      if (caractere === ',' && profondeur === 0) {
        colonnes.push(morceau);
        morceau = '';
      } else {
        morceau += caractere;
      }
    }
    colonnes.push(morceau);
    tables.set(
      nom,
      colonnes
        .map((une) => une.trim())
        .filter((une) => une && !/^(UNIQUE|CONSTRAINT|PRIMARY|CHECK|FOREIGN)\b/i.test(une))
        .map((une) => une.split(/\s+/)[0])
    );
  }
  return tables;
}

async function etatDeLaBase(sql) {
  const lignes = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const presentes = new Map();
  for (const ligne of lignes) {
    const nom = String(ligne.table_name);
    if (!presentes.has(nom)) presentes.set(nom, new Set());
    presentes.get(nom).add(String(ligne.column_name));
  }
  return presentes;
}

async function principal() {
  const action = process.argv[2];
  if (action !== 'check' && action !== 'apply') {
    console.error('Usage : node scripts/db.mjs check|apply');
    process.exit(2);
  }

  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL absente. Renseignez-la — la même que celle de l’hébergeur si\n' +
        'c’est la base de production que vous voulez examiner.'
    );
    process.exit(2);
  }

  const texte = readFileSync(SCHEMA, 'utf8');
  const sql = neon(url);
  const presentes = await etatDeLaBase(sql);
  const voulues = attendu(texte);

  const absentes = [];
  const incompletes = [];
  for (const [table, colonnes] of voulues) {
    const trouvee = presentes.get(table);
    if (!trouvee) {
      absentes.push(table);
      continue;
    }
    const manquantes = colonnes.filter((colonne) => !trouvee.has(colonne));
    if (manquantes.length) incompletes.push({ table, manquantes });
  }

  console.log(`${voulues.size} tables attendues, ${voulues.size - absentes.length} présentes.`);
  if (absentes.length) console.log(`\nTables absentes : ${absentes.join(', ')}`);
  for (const { table, manquantes } of incompletes) {
    console.log(`\nTable « ${table} » présente mais d’une autre forme.`);
    console.log(`  colonnes manquantes : ${manquantes.join(', ')}`);
  }

  if (!absentes.length && !incompletes.length) {
    console.log('\nLa base correspond au schéma. Rien à faire.');
    return;
  }

  if (incompletes.length) {
    // Une table du bon nom et de la mauvaise forme ne se répare pas par
    // `CREATE … IF NOT EXISTS` : il faudrait la renommer ou la déplacer, et ce
    // geste-là appartient à celui qui connaît ses données.
    console.error(
      '\nCes tables existent sous le bon nom mais ne portent pas les bonnes\n' +
        'colonnes. `db:apply` les sauterait en silence et l’application\n' +
        'échouerait à l’exécution. Renommez-les, ou pointez l’application sur\n' +
        'une base neuve, avant de poursuivre.'
    );
    process.exit(1);
  }

  if (action === 'check') {
    console.log('\n`npm run db:apply` créera ce qui manque, sans toucher au reste.');
    process.exit(1);
  }

  console.log('\nApplication du schéma…');
  let creees = 0;
  for (const une of instructions(texte)) {
    await sql.query(une);
    creees += 1;
  }
  console.log(`${creees} instructions exécutées.`);

  const apres = await etatDeLaBase(sql);
  const restantes = [...voulues.keys()].filter((table) => !apres.has(table));
  if (restantes.length) {
    console.error(`\nIl manque encore : ${restantes.join(', ')}`);
    process.exit(1);
  }
  console.log('La base correspond maintenant au schéma.');
}

principal().catch((souci) => {
  console.error('\nÉchec :', souci.message);
  process.exit(1);
});
