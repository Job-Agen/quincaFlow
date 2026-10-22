'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import { errorMessage } from '@/utils/errors';
import { shrinkImage } from '@/utils/image';
import type { Profile } from '@/types';

/**
 * Le logo de la boutique (§51).
 *
 * Il s'imprime en tête de chaque facture. Deux choix méritent d'être dits :
 *
 * — **Le PNG, et la transparence gardée.** Un logo est presque toujours posé
 *   sur un fond transparent ; le réencoder en JPEG sur fond blanc lui collerait
 *   un rectangle visible dès que la facture s'imprime sur autre chose que du
 *   blanc pur.
 * — **320 px de côté.** La facture l'affiche à deux centimètres. Au-delà, on
 *   transporte des pixels que personne ne verra, depuis une connexion qui se
 *   paie au mégaoctet.
 */
const MAX_SIDE = 320;

export default function LogoField({ disabled = false }: { disabled?: boolean }) {
  const { business, setProfile } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function envoyer(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Le champ est remis à zéro tout de suite : sans cela, rechoisir le même
    // fichier après un échec ne déclencherait aucun événement.
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const image = await shrinkImage(file, { maxSide: MAX_SIDE, type: 'image/png' });
      setProfile(await api.put<Profile>('/api/business/logo', { image }));
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }

  async function retirer() {
    setBusy(true);
    setError(null);
    try {
      setProfile(await api.put<Profile>('/api/business/logo', { image: '' }));
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logo-field">
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="logo-field__row">
        <span className="logo-field__preview">
          {business?.logo ? (
            // Une `data:` URL ne passe pas par l'optimiseur de Next : la balise
            // native est ici le bon outil, et l'image est déjà à sa taille.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo} alt={`Logo de ${business.name}`} />
          ) : (
            <ImageIcon size={24} className="muted" aria-hidden="true" />
          )}
        </span>

        <div className="stack" style={{ gap: 6, flex: 1 }}>
          <span className="field__label">Logo</span>
          <span className="field__hint">
            Affiché en tête des factures et des bons de commande.
          </span>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={envoyer}
      />

      <div className="logo-field__actions">
        <Button
          variant="soft"
          size="sm"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Envoi…' : business?.logo ? 'Remplacer' : 'Choisir une image'}
        </Button>
        {business?.logo ? (
          <Button variant="soft" size="sm" disabled={disabled || busy} onClick={retirer}>
            <Trash2 size={15} />
            Retirer
          </Button>
        ) : null}
      </div>
    </div>
  );
}
