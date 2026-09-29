/**
 * Jetons visuels, repris de `src/app/globals.css` (§32).
 *
 * Les valeurs sont recopiées plutôt qu'importées : React Native ne lit pas le
 * CSS, et une feuille de style web n'a pas d'équivalent ici. Ce fichier est donc
 * le seul endroit du mobile où une couleur est écrite en dur — les écrans
 * n'en contiennent aucune, pour que l'application garde l'unité des dix écrans
 * du web même en divergeant de leur technique.
 */
export const couleurs = {
  navy: '#134e8e',
  navyDark: '#0e3d71',
  blue: '#1668c9',
  blueDark: '#1257ab',
  blueSoft: '#e6effb',

  green: '#1fa463',
  greenDark: '#17804d',
  greenSoft: '#e6f6ec',
  amber: '#e0902a',
  amberSoft: '#fdf2de',
  red: '#dd3b33',
  redSoft: '#fdeceb',
  violet: '#6d4bd6',

  ink: '#111827',
  ink2: '#374151',
  muted: '#6b7280',
  faint: '#9aa3af',

  bg: '#eef2f7',
  surface: '#ffffff',
  surface2: '#f7f9fc',
  line: '#e3e8ef',
} as const;

export const rayons = { sm: 8, md: 12, lg: 16, full: 999 } as const;

/**
 * Hauteur minimale d'une cible tactile (§32).
 *
 * Quarante-quatre points : c'est la mesure qui permet de valider une vente avec
 * le pouce, sans regarder, au-dessus d'un comptoir.
 */
export const CIBLE_TACTILE = 44;
