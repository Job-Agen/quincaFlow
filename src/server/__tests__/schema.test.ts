import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Ce que `schema.sql` doit rester pour que la migration le comprenne.
 *
 * La production ne joue pas `schema.sql` tel quel : `scripts/db.mjs` le lit,
 * en déduit les tables et leurs colonnes, puis ajoute ce qui manque. Et il ne
 * lit les colonnes **que dans les blocs `CREATE TABLE`**.
 *
 * D'où un piège qui a failli partir en ligne au §59 : une colonne ajoutée par
 * un `ALTER TABLE … ADD COLUMN` isolé passe les tests — qui, eux, exécutent le
 * fichier en SQL brut sur une base vide — et n'atteint jamais la production,
 * où la fonctionnalité tombe sur une colonne absente. Le vert des tests disait
 * exactement le contraire de la vérité.
 */
describe('schema.sql reste lisible par la migration', () => {
  const schema = readFileSync(resolve(process.cwd(), 'schema.sql'), 'utf8');

  it('n’ajoute aucune colonne par un ALTER isolé', () => {
    const isoles = schema
      .split('\n')
      .filter((ligne) => /^\s*ALTER TABLE .*ADD COLUMN/i.test(ligne));
    // Une colonne nouvelle se déclare dans son `CREATE TABLE` : la migration
    // l'y lit et l'ajoute elle-même aux bases déjà en service.
    expect(isoles).toEqual([]);
  });

  it('déclare chaque table par CREATE TABLE IF NOT EXISTS', () => {
    const toutes = [...schema.matchAll(/^\s*CREATE TABLE(?: IF NOT EXISTS)? (\w+)/gim)];
    const sansGarde = [...schema.matchAll(/^\s*CREATE TABLE (?!IF NOT EXISTS)(\w+)/gim)];
    expect(toutes.length).toBeGreaterThan(20);
    expect(sansGarde.map((m) => m[1])).toEqual([]);
  });
});
