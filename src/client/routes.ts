/**
 * Les écrans qui échappent à la session, et pourquoi.
 *
 * Cette liste était écrite deux fois — dans `session.tsx`, qui redirige, et
 * dans `AppShell.tsx`, qui décide d'afficher la coque. Ajouter la page de
 * téléchargement à la seconde sans l'ajouter à la première a produit
 * exactement ce qu'on pouvait craindre : la page existait, s'affichait une
 * fraction de seconde, puis se faisait remplacer par l'écran de connexion.
 * Une règle de routage dite à deux endroits finit par être dite de deux
 * façons ; elle n'est donc plus dite qu'ici.
 *
 * Deux listes et non une, parce que les deux questions sont distinctes :
 *
 *   • « faut-il une session pour voir cet écran ? » — non, pour la connexion,
 *     l'inscription et le téléchargement ;
 *   • « une session ouverte a-t-elle encore quelque chose à y faire ? » — non
 *     pour la connexion et l'inscription, mais oui pour le téléchargement : un
 *     gérant connecté sur son ordinateur vient précisément y chercher l'APK
 *     pour son téléphone (§44).
 */

/** Écrans qui s'affichent sans session. */
export const PUBLIC_ROUTES: readonly string[] = ['/login', '/register', '/telecharger'];

/** Écrans d'entrée : une session ouverte y est renvoyée au tableau de bord. */
export const ENTRY_ROUTES: readonly string[] = ['/login', '/register'];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}

export function isEntryRoute(pathname: string): boolean {
  return ENTRY_ROUTES.includes(pathname);
}
