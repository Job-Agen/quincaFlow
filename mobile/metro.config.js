const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/**
 * Metro, configuré pour partager le domaine avec l'application web.
 *
 * `src/domain` et `src/types` vivent à la racine du dépôt, hors de `mobile/`.
 * Metro ne suit pas les imports au-delà de son dossier racine sans qu'on le lui
 * dise : `watchFolders` l'y autorise, et `nodeModulesPaths` lui laisse trouver
 * les dépendances installées dans `mobile/node_modules`.
 *
 * Ce partage est la raison d'être de React Native ici. L'arithmétique des
 * montants — la vente du §11, les conditionnements du §10, les marges du §39 —
 * est celle que couvrent les tests du web, pas une seconde implémentation qui
 * divergerait au premier correctif appliqué d'un seul côté.
 */
const projet = __dirname;
const depot = path.resolve(projet, '..');

const config = getDefaultConfig(projet);

config.watchFolders = [path.resolve(depot, 'src')];
config.resolver.nodeModulesPaths = [path.resolve(projet, 'node_modules')];
// `@/…` désigne la racine `src/` du dépôt, exactement comme côté web : le
// domaine importe `@/types`, et doit le trouver sans être modifié.
config.resolver.extraNodeModules = {
  '@': path.resolve(depot, 'src'),
};

module.exports = config;
