import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Démonte les composants entre deux tests.
 *
 * Sans cela, chaque rendu s'ajoute au document : une requête `getByText` finit
 * par trouver deux occurrences et le test échoue pour une raison qui n'a rien à
 * voir avec ce qu'il vérifie.
 */
afterEach(() => {
  cleanup();
});
