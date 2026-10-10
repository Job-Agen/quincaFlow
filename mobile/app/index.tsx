import { Redirect } from 'expo-router';
import { useSession } from '../src/lib/session';
import { Chargement } from '../src/ui';

/**
 * L'entrée de l'application (§41).
 *
 * Sans ce fichier, l'adresse d'ouverture — `quincaflow:///` — ne correspond à
 * aucune route, et expo-router affiche son propre écran « Unmatched Route » :
 * l'application s'ouvrait sur une page d'erreur. Le `_layout` redirige bien,
 * mais depuis un `useEffect`, c'est-à-dire après le premier rendu — trop tard,
 * l'écran d'erreur est déjà à l'écran.
 *
 * `Redirect` tranche pendant le rendu, donc rien d'autre ne s'affiche. Et la
 * destination se décide ici, à l'endroit qui ouvre la porte, plutôt que dans un
 * effet du layout qui ne savait pas quoi faire d'un gérant déjà connecté posé
 * sur la racine.
 */
export default function Entree() {
  const { statut } = useSession();

  // La garde du `_layout` ne monte la pile qu'une fois la session connue ; ce
  // garde-fou ne sert que si cet ordre venait à changer.
  if (statut === 'loading' || statut === 'unreachable') {
    return <Chargement label="Ouverture de la boutique" />;
  }

  return <Redirect href={statut === 'authenticated' ? '/dashboard' : '/login'} />;
}
