import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * L'arborescence des routes natives (§41).
 *
 * Ce fichier existe à cause d'une panne réelle : l'application s'ouvrait sur
 * « Unmatched Route ». Aucune route ne répondait à `/`, et rien ne le signalait
 * — ni `tsc`, ni eslint, ni la recherche des écrans dans le paquet compilé, qui
 * les trouvait tous puisqu'ils étaient bien là. Ils étaient présents sans être
 * atteignables.
 *
 * expo-router construit ses routes à partir des *noms de fichiers*. C'est donc
 * le système de fichiers qu'il faut interroger, pas le code.
 */

const RACINE = join(__dirname, '..', '..', 'mobile', 'app');

/** Tous les fichiers de route, en chemins relatifs à `app/`. */
function routes(dossier = RACINE): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return routes(chemin);
    return entree.endsWith('.tsx') ? [relative(RACINE, chemin).replace(/\.tsx$/, '')] : [];
  });
}

/**
 * L'adresse servie par un fichier : les groupes `(tabs)` ne pèsent pas dans le
 * chemin, et `index` désigne le dossier qui le contient.
 */
function adresse(route: string): string {
  const segments = route
    .split('/')
    .filter((s) => !/^\(.*\)$/.test(s))
    .filter((s) => s !== 'index');
  return '/' + segments.join('/');
}

const toutes = routes();
const ecrans = toutes.filter((r) => !r.endsWith('_layout'));

describe('routes natives', () => {
  it('sert la racine, sur laquelle l’application s’ouvre', () => {
    // Sans cela : « Unmatched Route — quincaflow:/// » au démarrage.
    expect(ecrans.map(adresse)).toContain('/');
  });

  it('place la racine hors des onglets, pour qu’elle puisse rediriger', () => {
    const racine = ecrans.find((r) => adresse(r) === '/');
    expect(racine).toBe('index');
  });

  it('redirige vers la connexion ou le tableau de bord, et nulle part ailleurs', () => {
    const source = readFileSync(join(RACINE, 'index.tsx'), 'utf8');
    expect(source).toMatch(/Redirect/);
    expect(source).toMatch(/\/dashboard/);
    expect(source).toMatch(/\/login/);
  });

  it('déclare dans le layout chaque écran de premier niveau', () => {
    const layout = readFileSync(join(RACINE, '_layout.tsx'), 'utf8');
    const declares = new Set(
      [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1] as string)
    );
    // Les écrans des onglets sont déclarés par `(tabs)/_layout`, pas ici.
    const attendus = ecrans.filter((r) => !r.startsWith('(tabs)/'));
    const oublies = attendus.filter((r) => !declares.has(r));
    expect(oublies).toEqual([]);
  });

  it('ne déclare aucun écran qui n’existe pas', () => {
    const layout = readFileSync(join(RACINE, '_layout.tsx'), 'utf8');
    const declares = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map(
      (m) => m[1] as string
    );
    const connus = new Set([...ecrans, '(tabs)']);
    expect(declares.filter((n) => !connus.has(n))).toEqual([]);
  });

  it('porte les six onglets du §6', () => {
    const onglets = ecrans
      .filter((r) => r.startsWith('(tabs)/'))
      .map((r) => r.split('/')[1] as string);
    expect(onglets.sort()).toEqual(
      ['dashboard', 'history', 'more', 'products', 'purchases', 'sale'].sort()
    );
  });
});
