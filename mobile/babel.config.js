/**
 * Babel pour l'application mobile.
 *
 * L'alias `@` double celui de Metro : Metro résout les modules, Babel résout
 * les chemins à la compilation. Les deux sont nécessaires pour que
 * `import { buildSaleLine } from '@/domain/sale'` fonctionne dans un écran.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: { '@': '../src', '~': '.' },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
    ],
  };
};
