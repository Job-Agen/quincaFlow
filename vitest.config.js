import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Le domaine et la couche serveur sont du JavaScript pur : aucun DOM à
    // simuler, et l'environnement node démarre nettement plus vite.
    environment: 'node',
  },
});
