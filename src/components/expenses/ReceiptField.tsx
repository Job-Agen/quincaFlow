'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import { api } from '@/client/api';
import { errorMessage } from '@/utils/errors';
import type { Receipt } from '@/types';

/**
 * Justificatif d'une dépense (§40, F15).
 *
 * « 45 000 de transport » sans pièce se discute ; avec le reçu, non. Deux
 * décisions font tout l'intérêt de ce composant :
 *
 * — **L'image est réduite sur le téléphone, avant l'envoi.** Un cliché moderne
 *   pèse trois à cinq mégaoctets ; tel quel, il ne part pas d'un comptoir de
 *   Lomé, et l'échec arriverait après une minute d'attente. Réduit à 1 200 px de
 *   côté en JPEG, un reçu manuscrit reste parfaitement lisible pour environ
 *   150 Ko.
 * — **La galerie est proposée autant que l'appareil.** `capture` est offert, pas
 *   imposé : le reçu est souvent déjà dans le téléphone, photographié chez le
 *   grossiste une heure plus tôt.
 */

/** Côté maximal de l'image envoyée. Au-delà, on ne gagne rien de lisible. */
const MAX_SIDE = 1200;
const JPEG_QUALITY = 0.72;

/**
 * Réduit une photo et la rend en `data:` URL JPEG.
 *
 * Le dessin passe par un canvas : c'est le seul moyen, dans un navigateur, de
 * réencoder une image à une autre taille. L'objet URL est révoqué dans tous les
 * cas — une photo de 4 Mo retenue par un `blob:` oublié à chaque saisie finirait
 * par faire tomber l'onglet.
 */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image illisible.'));
      element.src = url;
    });

    const ratio = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne peut pas réduire cette photo.');
    // Fond blanc : un PNG transparent réencodé en JPEG donnerait sinon un reçu
    // sur fond noir, illisible.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ReceiptField({
  expenseId,
  hasReceipt,
  onChange,
}: {
  /** `null` : la dépense n'existe pas encore, le reçu se joindra après l'enregistrement. */
  expenseId: string | null;
  hasReceipt: boolean;
  onChange: (hasReceipt: boolean) => void;
}) {
  /**
   * Image détenue, et la dépense à laquelle elle appartient.
   *
   * Les deux vivent dans le même état, et c'est le point : l'identifiant permet
   * d'affirmer au rendu que la photo est bien celle de la dépense ouverte, et
   * empêche l'effet de redemander au serveur une image qu'on vient de lui
   * envoyer. Séparés, rien n'interdirait d'afficher le reçu de la dépense
   * précédente le temps d'un rendu.
   */
  const [held, setHeld] = useState<{ expenseId: string; receipt: Receipt } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  // L'image n'est demandée qu'ici, à l'ouverture d'une dépense qui en porte une :
  // la liste, elle, ne transporte jamais de photo (§40).
  useEffect(() => {
    if (!expenseId || !hasReceipt || held?.expenseId === expenseId) return undefined;
    let cancelled = false;
    api
      .get<Receipt>(`/api/expenses/${expenseId}/receipt`)
      .then((found) => {
        if (!cancelled) setHeld({ expenseId, receipt: found });
      })
      .catch(() => {
        // Un justificatif introuvable ne doit pas masquer la dépense elle-même.
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId, hasReceipt, held]);

  // L'image affichée est celle de la dépense ouverte, et seulement si elle en
  // porte encore une : la dériver évite un état qui survivrait à sa suppression.
  const receipt = hasReceipt && held?.expenseId === expenseId ? held.receipt : null;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Le champ est remis à zéro tout de suite : sans cela, reprendre la même photo
    // après une erreur ne déclencherait aucun changement.
    event.target.value = '';
    if (!file || !expenseId) return;

    setBusy(true);
    setError(null);
    try {
      const image = await shrink(file);
      const saved = await api.put<Receipt>(`/api/expenses/${expenseId}/receipt`, {
        image,
        name: file.name,
      });
      setHeld({ expenseId, receipt: saved });
      onChange(true);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!expenseId) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/expenses/${expenseId}/receipt`);
      setHeld(null);
      onChange(false);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }

  if (!expenseId) {
    return (
      <>
        <span className="field__label">Justificatif</span>
        <p className="muted small">
          Enregistrez d’abord la dépense : la photo du reçu se joindra ensuite.
        </p>
      </>
    );
  }

  return (
    <>
      <span className="field__label">Justificatif</span>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {receipt ? (
        <div className="receipt">
          <button
            type="button"
            className="appbar__icon"
            aria-label="Agrandir le reçu"
            onClick={() => setZoomed((open) => !open)}
          >
            {/* Une `data:` URL ne passe pas par l'optimiseur d'images de Next :
                la balise native est ici le bon outil, pas un contournement. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="receipt__thumb" src={receipt.url} alt="" />
          </button>
          <div className="list__body">
            <div className="list__title">{receipt.name}</div>
            <div className="list__sub muted small">Touchez la photo pour l’agrandir.</div>
          </div>
          <button
            type="button"
            className="appbar__icon"
            aria-label="Supprimer le justificatif"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 size={18} className="muted" />
          </button>
        </div>
      ) : null}

      {zoomed && receipt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="receipt__full" src={receipt.url} alt={`Reçu : ${receipt.name}`} />
      ) : null}

      <div className="grid-2">
        <Button variant="soft" disabled={busy} onClick={() => camera.current?.click()}>
          <Camera size={17} /> {busy ? 'Envoi…' : 'Photo'}
        </Button>
        <Button variant="soft" disabled={busy} onClick={() => gallery.current?.click()}>
          <ImageIcon size={17} /> Galerie
        </Button>
      </div>

      {/* Deux champs plutôt qu'un : `capture` oriente vers l'appareil, et sans
          second champ le gérant ne pourrait pas choisir un reçu déjà pris. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={upload}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={upload}
      />
    </>
  );
}
