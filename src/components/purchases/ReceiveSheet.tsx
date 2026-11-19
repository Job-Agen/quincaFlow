'use client';

import { useState } from 'react';
import { Button, Notice, Sheet, TextField } from '@/components/ui';
import { remainingOf } from '@/domain/purchase';
import { withUnit } from '@/utils/format';
import { errorMessage } from '@/utils/errors';
import type { PurchaseOrder, PurchaseOrderItemRow } from '@/types';

/**
 * Réception (§22, §72).
 *
 * Chaque marchandise se valide **une par une** : le fournisseur livre
 * rarement tout d'un coup, et ce qui n'est pas arrivé ne doit pas entrer en
 * stock parce qu'une case était pré-cochée. Rien n'est validé tant que le
 * gérant ne l'a pas coché, et la quantité ne s'ouvre qu'ensuite.
 *
 * Quand tout est bien arrivé, on ne passe pas par ici : le bouton « Marquer
 * comme livrée » (§63) le fait d'un geste. Cet écran-là est celui des
 * livraisons partielles, et il est fait pour qu'on s'y arrête.
 */
export default function ReceiveSheet({
  open,
  order,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: PurchaseOrder;
  onClose: () => void;
  onConfirm: (body: {
    lines: { itemId: string; quantity: number; transport: number }[];
    notes: string;
    transporter: string;
  }) => Promise<void>;
}) {
  // Les marchandises que le gérant a validées. Vide au départ : c'est le
  // propre de cet écran que rien n'entre sans un geste par marchandise.
  const [validees, setValidees] = useState<Record<string, boolean>>({});
  // Quantités saisies, par identifiant de ligne. Une ligne absente signifie
  // « le reste à livrer », valeur pré-remplie tant que le gérant n'y touche pas.
  const [lines, setLines] = useState<Record<string, number>>({});
  // Ce que le camion a coûté, marchandise par marchandise (§69). Ici le
  // gérant répartit lui-même : c'est l'écran de la réception détaillée, celui
  // où l'on reprend chaque ligne.
  const [transports, setTransports] = useState<Record<string, string>>({});
  const [transporteur, setTransporteur] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = order.items.filter((item) => remainingOf(item) > 0);
  const valueOf = (item: PurchaseOrderItemRow) => lines[item.id] ?? remainingOf(item);
  const retenues = pending.filter((item) => validees[item.id]);
  const toutCoche = retenues.length === pending.length && pending.length > 0;

  function basculer(item: PurchaseOrderItemRow, coche: boolean) {
    setValidees({ ...validees, [item.id]: coche });
    setError(null);
  }

  return (
    <Sheet open={open} title="Réceptionner" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p className="small muted">
        Cochez les marchandises qui sont arrivées, et corrigez les quantités si le compte n&apos;y
        est pas. Ce qui n&apos;est pas coché reste à livrer.
      </p>

      <div className="reception-tete">
        <span className="small">
          <strong>{retenues.length}</strong> sur {pending.length} validée
          {retenues.length > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          className="link"
          onClick={() => {
            const toutes: Record<string, boolean> = {};
            pending.forEach((item) => {
              toutes[item.id] = !toutCoche;
            });
            setValidees(toutes);
            setError(null);
          }}
        >
          {toutCoche ? 'Tout décocher' : 'Tout cocher'}
        </button>
      </div>

      {pending.map((item) => {
        const retenue = Boolean(validees[item.id]);
        return (
          <div key={item.id} className="reception-ligne" data-validee={retenue}>
            <label className="field field--inline reception-ligne__coche">
              <input
                type="checkbox"
                checked={retenue}
                onChange={(event) => basculer(item, event.target.checked)}
                aria-label={`${item.product_name} livré`}
              />
              <span>
                <strong>{item.product_name}</strong>
                <span className="small muted">
                  {' '}
                  — reste à livrer {withUnit(remainingOf(item), item.unit_label)}
                </span>
              </span>
            </label>

            {/* Les champs ne s'ouvrent qu'une fois la marchandise validée :
              une quantité saisie sous une case décochée ne partirait pas, et
              le gérant croirait l'avoir reçue. */}
            {retenue ? (
              <div className="grid-2">
                <TextField
                  label={`Quantité (${item.unit_label})`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={remainingOf(item)}
                  step="any"
                  value={valueOf(item)}
                  onChange={(event) =>
                    setLines({ ...lines, [item.id]: Number(event.target.value) || 0 })
                  }
                />
                <TextField
                  label="Transport"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={transports[item.id] ?? ''}
                  onChange={(event) =>
                    setTransports({ ...transports, [item.id]: event.target.value })
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <TextField
        label="Transporteur (optionnel)"
        placeholder="Nom du transporteur"
        value={transporteur}
        onChange={(event) => setTransporteur(event.target.value)}
      />

      <TextField
        label="Note (optionnelle)"
        placeholder="Livraison partielle, 20 sacs à suivre"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <Button
        variant="success"
        block
        disabled={busy || retenues.length === 0}
        onClick={async () => {
          // Une marchandise cochée mais sans quantité est une contradiction :
          // on la nomme plutôt que de laisser le serveur répondre « indiquez
          // au moins une quantité », qui ne dit pas laquelle.
          const vide = retenues.find((item) => valueOf(item) <= 0);
          if (vide) {
            setError(`Quelle quantité de ${vide.product_name} a été livrée ?`);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onConfirm({
              notes,
              transporter: transporteur,
              lines: retenues.map((item) => ({
                itemId: item.id,
                quantity: valueOf(item),
                transport: Number(transports[item.id]) || 0,
              })),
            });
          } catch (issue) {
            setError(errorMessage(issue));
          }
          setBusy(false);
        }}
      >
        {busy
          ? 'Enregistrement…'
          : retenues.length === 0
            ? 'Cochez ce qui est arrivé'
            : `Enregistrer ${retenues.length} marchandise${retenues.length > 1 ? 's' : ''}`}
      </Button>
    </Sheet>
  );
}
