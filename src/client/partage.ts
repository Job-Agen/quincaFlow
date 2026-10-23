'use client';

import { planFacture } from '@/domain/facturePdf';
import { tracerFacture } from '@/domain/tracePdf';
import type { BusinessRow, Sale } from '@/types';

/**
 * Envoyer la facture, en pièce jointe (§57).
 *
 * Jusqu'ici le bouton « Partager WhatsApp » n'envoyait qu'un texte : une liste
 * d'articles et un total. Le client recevait un message, pas une facture. Ce
 * module fabrique le vrai fichier et le confie au partage du téléphone, qui
 * propose WhatsApp parmi les autres applications.
 *
 * Trois replis, du meilleur au moins bon, parce que le partage de fichiers
 * n'existe pas partout :
 *
 * 1. `navigator.share` avec le fichier — Android et iPhone. Le client reçoit le
 *    PDF dans la conversation.
 * 2. Le navigateur n'en veut pas : le PDF est téléchargé, et WhatsApp s'ouvre
 *    avec le texte. Le gérant joint le fichier lui-même, en deux gestes.
 * 3. Rien ne marche : le PDF est téléchargé, et c'est déjà ce qu'il voulait.
 *
 * Le repli n'est pas un détail : un gérant qui appuie sur « Envoyer » et à qui
 * il ne se passe rien conclut que l'application est cassée.
 */

export type Issue = 'partagé' | 'téléchargé';

/** Le PDF de la facture, prêt à joindre. */
export async function fichierFacture(
  sale: Sale,
  business: BusinessRow | null | undefined,
  currency: string
): Promise<File> {
  const plan = planFacture(sale, business, currency);
  const octets = await tracerFacture(plan);
  // `Uint8Array` et non le tableau brut : certaines implémentations de `File`
  // refusent un ArrayBuffer nu.
  return new File([new Uint8Array(octets)], plan.nomFichier, { type: 'application/pdf' });
}

function telecharger(fichier: File): void {
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = fichier.name;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Révoqué plus tard : révoquer tout de suite annule le téléchargement sur
  // certains navigateurs, qui n'ont pas encore lu le blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Partage la facture, ou la télécharge si le partage de fichiers n'existe pas.
 *
 * `canShare({ files })` est interrogé avant d'essayer : sans cette question,
 * Safari lève une exception au lieu de répondre non.
 */
export async function envoyerFacture(
  sale: Sale,
  business: BusinessRow | null | undefined,
  currency: string,
  message: string
): Promise<Issue> {
  const fichier = await fichierFacture(sale, business, currency);
  const partage = { files: [fichier], title: fichier.name, text: message };

  if (navigator.canShare?.(partage)) {
    try {
      await navigator.share(partage);
      return 'partagé';
    } catch (erreur) {
      // L'utilisateur a fermé la feuille de partage : ce n'est pas une panne,
      // et lui télécharger le fichier dans le dos serait une surprise.
      if (erreur instanceof DOMException && erreur.name === 'AbortError') return 'partagé';
    }
  }

  telecharger(fichier);
  return 'téléchargé';
}
