'use client';

import Link from 'next/link';
import { useSession } from '@/client/session';

/**
 * Pied de la page de téléchargement, selon qu'on a une session ou non.
 *
 * La page vit hors de la coque : ni barre d'onglets, ni menu latéral, ni
 * bouton de retour. Pour un visiteur, c'est voulu — il n'a pas encore de
 * compte. Pour un gérant connecté qui vient d'y arriver depuis « Plus », c'est
 * une impasse : rien à l'écran ne le ramène à sa boutique. D'où ce pied, qui
 * dit l'une ou l'autre chose.
 */
export default function RetourApplication() {
  const { status } = useSession();

  if (status === 'authenticated') {
    return (
      <Link href="/dashboard" className="link">
        Retour à l’application
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className="link">
        Se connecter
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/register" className="link">
        Créer une boutique
      </Link>
    </>
  );
}
