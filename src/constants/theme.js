export const COLORS = {
  bg: '#0D0905',
  card: '#1A1008',
  card2: '#221408',
  amber: '#F5A623',
  terra: '#D4622A',
  green: '#2EAA6B',
  red: '#D93B2A',
  blue: '#3A8FD4',
  text: '#F5EDD8',
  muted: '#8B7B64',
  border: '#362210',
};

export const FONTS = {
  heading: "'Syne', sans-serif",
  body: "'DM Sans', sans-serif",
};

/**
 * Échelle d'empilement unique pour toute l'application.
 *
 * Les couches doivent rester distinctes : à valeur égale, c'est l'ordre du DOM
 * qui tranche, et la navigation (rendue après <main> dans AppShell) passait
 * devant les modales qu'elle aurait dû laisser au-dessus d'elle.
 */
export const Z = {
  sidebar: 100,
  bottomNav: 1000,
  modal: 1500,
  toast: 2000,
};
