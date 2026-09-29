import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Deux familles de tests, deux environnements.
 *
 * Le domaine et la couche serveur sont du TypeScript pur : aucun DOM à simuler,
 * et l'environnement node démarre nettement plus vite. Les écrans, eux, ont
 * besoin d'un DOM — les monter est le seul moyen de vérifier ce que le gérant
 * voit réellement, par exemple qu'une coupure réseau ne le renvoie pas à l'écran
 * de connexion (§38).
 *
 * Les séparer évite de payer jsdom sur les trois quarts de la suite.
 */
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'métier',
          environment: 'node',
          include: ['src/{domain,server,lib,utils}/**/*.test.{ts,tsx}'],
        },
      },
      {
        // `tsconfig.json` garde `jsx: preserve`, que Next transforme lui-même.
        // Vitest a besoin qu'on la fasse pour lui : d'où ce greffon, qui compile
        // le JSX des tests d'interface.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'interface',
          environment: 'jsdom',
          include: ['src/{client,components,app}/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setupDom.ts'],
        },
      },
    ],
  },
});
