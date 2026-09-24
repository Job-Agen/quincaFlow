'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Barre d'application bleu marine.
 *
 * Deux variantes seulement : une barre d'accueil qui affiche le nom de la
 * boutique, et une barre d'écran secondaire avec un retour à gauche et le titre
 * centré. Le créneau vide à droite garde le titre réellement centré quand il n'y
 * a pas d'action.
 */
export default function AppBar({ title, back, brand, left, right }) {
  const router = useRouter();

  return (
    <header className={`appbar${brand ? ' appbar--brand' : ''}`}>
      <div className="appbar__slot">
        {back ? (
          <button
            type="button"
            className="appbar__icon"
            aria-label="Retour"
            onClick={() => (typeof back === 'string' ? router.push(back) : router.back())}
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          left
        )}
      </div>
      <h1 className="appbar__title">{title}</h1>
      <div className="appbar__slot">{right}</div>
    </header>
  );
}
