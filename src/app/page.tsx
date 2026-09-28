import { redirect } from 'next/navigation';

/**
 * La racine mène au tableau de bord.
 *
 * Le PRD nomme cet écran `/dashboard` (§30) ; la racine reste une adresse
 * valide, parce que c'est celle qu'un gérant tape ou met en favori.
 */
export default function RootPage() {
  redirect('/dashboard');
}
