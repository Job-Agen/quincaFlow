/**
 * Message lisible d'une exception.
 *
 * TypeScript type toute exception en `unknown`, ce qui est exact : un `throw`
 * peut lancer n'importe quoi. Plutôt que de forcer le type à chaque `catch`,
 * cette fonction fait la vérification une fois et rend toujours une phrase
 * affichable — un écran ne doit jamais montrer « [object Object] ».
 */
export function errorMessage(issue: unknown, fallback = 'Une erreur est survenue.'): string {
  if (issue instanceof Error && issue.message) return issue.message;
  if (typeof issue === 'string' && issue.trim()) return issue;
  return fallback;
}
