import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';

// Les règles par défaut de Next passent telles quelles : aucune exception à
// maintenir, et notamment pas de dérogation à `react-hooks/set-state-in-effect`.
const config = [...nextCoreWebVitals, prettierConfig];

export default config;
