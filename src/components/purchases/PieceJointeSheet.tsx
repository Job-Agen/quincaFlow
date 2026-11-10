'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { FileUp, Link2 } from 'lucide-react';
import { Button, Notice, SelectField, Sheet, TextField } from '@/components/ui';
import { errorMessage } from '@/utils/errors';
import { shrinkImage } from '@/utils/image';
import { DOCUMENT_KINDS } from '@/domain/purchase';
import { MAX_OCTETS, TYPES_ACCEPTES, poidsLisible, refus } from '@/domain/pieceJointe';

/**
 * Joindre une pièce à une commande (§59).
 *
 * Jusqu'ici l'écran ne savait enregistrer qu'un **nom et un lien** : au gérant
 * de ranger le fichier ailleurs, puis d'en coller l'adresse. Personne ne le
 * faisait — un gérant au comptoir n'a pas d'hébergeur, il a une facture entre
 * les mains et un téléphone.
 *
 * Le fichier prend donc la première place, et le lien reste en second pour qui
 * range déjà ses pièces dans un nuage.
 *
 * **Les photos sont réduites avant l'envoi**, comme le justificatif de dépense
 * (§40) : un cliché moderne pèse quatre mégaoctets et ne part pas d'un comptoir
 * de Lomé. Réduit, il en pèse deux cents kilo-octets et reste lisible. Le PDF et
 * le document Word, eux, ne se réduisent pas : ils passent tels quels, sous la
 * borne, ou sont refusés tout de suite plutôt qu'après une minute d'attente.
 */

/** Ce que le sélecteur de fichiers propose, dans l'ordre où on l'attend. */
const ACCEPTE = Object.keys(TYPES_ACCEPTES).join(',');

/** Côté maximal d'une photo jointe : une facture A4 reste lisible à 1 600 px. */
const MAX_COTE = 1600;

interface Choix {
  nom: string;
  mime: string;
  octets: number;
  contenu: string;
  reduite: boolean;
}

export default function PieceJointeSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (body: {
    kind: string;
    name: string;
    url?: string;
    content?: string;
  }) => Promise<void>;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState('SUPPLIER_INVOICE');
  const [nom, setNom] = useState('');
  const [lien, setLien] = useState('');
  const [choix, setChoix] = useState<Choix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reinitialiser() {
    setChoix(null);
    setNom('');
    setLien('');
    setError(null);
    if (champ.current) champ.current.value = '';
  }

  async function choisir(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    if (!fichier) return;
    setError(null);
    setBusy(true);
    try {
      // Une photo se réduit ; un PDF, un Word ou un Excel se lisent tels quels.
      const estPhoto = /^image\/(jpeg|png|webp)$/.test(fichier.type);
      const contenu = estPhoto
        ? await shrinkImage(fichier, {
            maxSide: MAX_COTE,
            type: 'image/jpeg',
            quality: 0.75,
            background: '#ffffff',
          })
        : await lireTelQuel(fichier);

      const empeche = refus(contenu);
      if (empeche) {
        setError(empeche);
        setChoix(null);
      } else {
        const octets = estPhoto ? Math.round((contenu.length * 3) / 4) : fichier.size;
        setChoix({
          nom: fichier.name,
          mime: estPhoto ? 'image/jpeg' : fichier.type,
          octets,
          contenu,
          reduite: estPhoto && octets < fichier.size,
        });
        // Le nom du fichier est presque toujours le bon : il est proposé, pas
        // imposé — « IMG_20261110.jpg » mérite d'être renommé.
        if (!nom.trim()) setNom(fichier.name.replace(/\.[^.]+$/, ''));
      }
    } catch (souci) {
      setError(errorMessage(souci));
      setChoix(null);
    }
    setBusy(false);
  }

  const pret = Boolean(nom.trim()) && (Boolean(choix) || Boolean(lien.trim()));

  return (
    <Sheet
      open={open}
      title="Joindre un document"
      onClose={() => {
        reinitialiser();
        onClose();
      }}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}

      <SelectField label="Type" value={kind} onChange={(event) => setKind(event.target.value)}>
        {Object.entries(DOCUMENT_KINDS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>

      {/* Le champ natif reste caché, comme pour le justificatif de dépense
        (§40) : il s'affiche « Choose File », en anglais, sans style, et ne se
        met pas en français. C'est le bouton en dessous qui l'ouvre. */}
      <input
        ref={champ}
        type="file"
        accept={ACCEPTE}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={choisir}
      />
      <button
        type="button"
        className="btn btn--dashed btn--block"
        disabled={busy}
        onClick={() => champ.current?.click()}
      >
        <FileUp size={18} />
        {choix ? 'Choisir un autre fichier' : 'Choisir un fichier'}
      </button>

      {choix ? (
        <p className="small muted">
          <strong>{choix.nom}</strong> · {poidsLisible(choix.octets)}
          {choix.reduite ? ' (photo réduite pour l’envoi)' : ''}
        </p>
      ) : (
        <p className="small muted">
          PDF, photo, Word ou Excel — jusqu’à {poidsLisible(MAX_OCTETS)}. Les photos sont réduites
          avant l’envoi.
        </p>
      )}

      <TextField
        label="Nom"
        placeholder="Facture Bâtir Plus mars"
        value={nom}
        onChange={(event) => setNom(event.target.value)}
      />

      <details>
        <summary className="small muted">
          <Link2 size={14} /> Plutôt un lien vers un fichier rangé ailleurs
        </summary>
        <TextField
          label="Lien"
          type="url"
          placeholder="https://…"
          hint="Utile si vos pièces sont déjà dans un nuage. Ignoré si un fichier est choisi."
          value={lien}
          onChange={(event) => setLien(event.target.value)}
        />
      </details>

      <Button
        block
        disabled={busy || !pret}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onConfirm({
              kind,
              name: nom.trim(),
              // Le fichier l'emporte sur le lien : les deux saisis, c'est le
              // fichier qu'on a sous les yeux qui compte.
              ...(choix ? { content: choix.contenu } : { url: lien.trim() }),
            });
            reinitialiser();
          } catch (souci) {
            setError(errorMessage(souci));
          }
          setBusy(false);
        }}
      >
        {busy ? 'Envoi…' : 'Joindre'}
      </Button>
    </Sheet>
  );
}

/** Lit un fichier en `data:` URL, sans le toucher. */
function lireTelQuel(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error('Ce fichier n’a pas pu être lu.'));
    lecteur.readAsDataURL(fichier);
  });
}
