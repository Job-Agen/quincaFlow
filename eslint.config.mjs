import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';

export default [
  ...nextCoreWebVitals,
  prettierConfig,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      // Real anti-pattern, but used in current views (form reset via useEffect).
      // Downgrade for Phase 0; addressed properly in Phase 1 when state moves
      // into Server Actions / external store.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
