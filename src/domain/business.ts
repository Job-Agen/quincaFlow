/**
 * Suppression d'une boutique (§46).
 *
 * La règle tient en une phrase : pour effacer sa quincaillerie, le gérant doit
 * en retaper le nom. C'est le seul garde-fou qui ne s'actionne pas par
 * inadvertance — une case à cocher se coche du pouce, un nom se tape.
 *
 * Reste à décider de la tolérance, et c'est tout l'objet de ce module. Trop
 * stricte, elle punit l'orthographe : « Quincaillerie Le Bâtisseur » demande un
 * accent circonflexe que le clavier d'un téléphone d'entrée de gamme ne donne
 * pas sans peine, et le gérant abandonne devant un bouton qui refuse une
 * réponse juste. Trop lâche, elle ne protège plus rien.
 *
 * On compare donc des noms *dépouillés* : espaces de bord retirés, espaces
 * intérieurs ramenés à un seul, casse et accents ignorés. Il faut toujours
 * avoir tapé le nom entier — mais « quincaillerie le batisseur » suffit.
 */

/** Le nom, réduit à ce qui doit vraiment correspondre. */
export function plainName(value: unknown): string {
  return (
    String(value ?? '')
      .normalize('NFD')
      // Les signes diacritiques décomposés par NFD : accents, cédille, tréma.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/**
 * Vrai si la saisie confirme le nom de la boutique.
 *
 * Un nom vide ne confirme jamais rien : sans cette garde, une boutique dont le
 * nom serait vide — ce que la base interdit, mais pas le temps — se laisserait
 * effacer par un champ laissé blanc.
 */
export function confirmsBusinessName(typed: unknown, name: unknown): boolean {
  const attendu = plainName(name);
  return attendu.length > 0 && plainName(typed) === attendu;
}
