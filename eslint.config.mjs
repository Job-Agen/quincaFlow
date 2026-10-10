import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';

// Les règles par défaut de Next passent telles quelles : aucune exception à
// maintenir, et notamment pas de dérogation à `react-hooks/set-state-in-effect`.
//
// Seule exception, et elle porte sur le vocabulaire et non sur l'exigence :
// dans `mobile/`, `Image` est celle de React Native, qui n'a pas d'attribut
// `alt`. Son équivalent s'appelle `accessibilityLabel`, que `jsx-a11y` ne
// connaît pas. Désactiver la règle ici ne relâche rien — l'alternative serait
// de la satisfaire avec un attribut que React Native ignore, donc d'inscrire
// une accessibilité fictive.
const config = [
  ...nextCoreWebVitals,
  prettierConfig,
  {
    files: ['mobile/**/*.{ts,tsx}'],
    rules: { 'jsx-a11y/alt-text': 'off' },
  },
];

export default config;
