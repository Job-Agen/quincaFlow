'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Notice, SelectField, Sheet, TextAreaField, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/domain/report';
import { PERIODES, PERIODES_ORDRE, type ChargeRow } from '@/domain/charge';
import { money } from '@/utils/format';
import { errorMessage } from '@/utils/errors';

/**
 * Saisie d'une charge récurrente (§66).
 *
 * La même feuille crée et corrige, comme la fiche produit : un champ ajouté
 * d'un côté manquerait de l'autre.
 *
 * `suppression` la détourne en confirmation d'effacement. Les deux textes
 * vivent ensemble parce qu'ils parlent de la même chose, et qu'une
 * confirmation qui ne nomme pas ce qu'elle efface ne confirme rien.
 */
export default function ChargeSheet({
  charge,
  suppression,
  onClose,
  onEnregistree,
  onSupprimer,
}: {
  charge: ChargeRow | null;
  suppression?: boolean;
  onClose: () => void;
  onEnregistree: () => void;
  /** Ouvre la confirmation d'effacement, depuis la feuille de modification. */
  onSupprimer?: () => void;
}) {
  const { currency } = useSession();
  const [form, setForm] = useState({
    category: charge?.category || 'RENT',
    label: charge?.label || '',
    amount: charge?.amount ?? '',
    periode: charge?.periode || 'MONTHLY',
    nextDueOn: charge?.next_due_on || '',
    note: charge?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const set = (champ: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [champ]: event.target.value });

  async function enregistrer() {
    setBusy(true);
    setErreur(null);
    try {
      if (charge) await api.put(`/api/charges/${charge.id}`, { ...form, active: charge.active });
      else await api.post('/api/charges', form);
      onEnregistree();
    } catch (souci) {
      setErreur(errorMessage(souci));
      setBusy(false);
    }
  }

  async function ranger() {
    setBusy(true);
    setErreur(null);
    try {
      await api.put(`/api/charges/${charge!.id}`, { ...form, active: false });
      onEnregistree();
    } catch (souci) {
      setErreur(errorMessage(souci));
      setBusy(false);
    }
  }

  if (suppression && charge) {
    return (
      <Sheet open title="Supprimer la charge" onClose={onClose}>
        {erreur ? <Notice tone="error">{erreur}</Notice> : null}
        <p className="small">
          <strong>{charge.label}</strong> ne sera plus rappelée. Les dépenses déjà payées
          restent : l’argent est sorti, effacer la promesse n’efface pas le fait.
        </p>
        <p className="small muted">
          Si la charge reprend un jour — un employé en congé, un local relouté —, rangez-la
          plutôt : elle garde son historique et revient d’un geste.
        </p>
        <Button variant="danger" block disabled={busy} onClick={onEnregistree}>
          {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </Button>
        <Button variant="soft" block disabled={busy} onClick={ranger}>
          Ranger plutôt
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet open title={charge ? charge.label : 'Nouvelle charge'} onClose={onClose}>
      {erreur ? <Notice tone="error">{erreur}</Notice> : null}

      <SelectField label="Poste" value={form.category} onChange={set('category')}>
        {EXPENSE_CATEGORIES.map((categorie) => (
          <option key={categorie} value={categorie}>
            {EXPENSE_CATEGORY_LABELS[categorie]}
          </option>
        ))}
      </SelectField>

      <TextField
        label="Libellé"
        placeholder="Salaire Kodjo, Loyer boutique, Facture CEET…"
        value={form.label}
        onChange={set('label')}
        required
      />

      <div className="grid-2">
        <TextField
          label={`Montant habituel (${currency})`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          hint="Modifiable à chaque paiement."
          value={form.amount}
          onChange={set('amount')}
        />
        <SelectField label="Revient" value={form.periode} onChange={set('periode')}>
          {PERIODES_ORDRE.map((periode) => (
            <option key={periode} value={periode}>
              {PERIODES[periode].label}
            </option>
          ))}
        </SelectField>
      </div>

      <TextField
        label="Prochaine échéance"
        type="date"
        hint={
          charge
            ? 'Avancée toute seule à chaque paiement.'
            : 'Le prochain jour où il faudra payer. Vide : aujourd’hui.'
        }
        value={form.nextDueOn}
        onChange={set('nextDueOn')}
      />

      <TextAreaField label="Note (optionnel)" rows={2} value={form.note} onChange={set('note')} />

      <Button block disabled={busy || !form.label.trim()} onClick={enregistrer}>
        {busy ? 'Enregistrement…' : charge ? 'Enregistrer' : 'Créer la charge'}
      </Button>

      {charge && charge.active ? (
        <Button variant="soft" block disabled={busy} onClick={ranger}>
          Ranger cette charge
        </Button>
      ) : null}
      {charge && onSupprimer ? (
        <Button variant="soft" block disabled={busy} onClick={onSupprimer}>
          <Trash2 size={17} />
          Supprimer
        </Button>
      ) : null}
      {charge && !charge.active ? (
        <p className="small muted">
          Rangée. Elle ne sera plus rappelée ; sa dernière échéance était le{' '}
          {charge.next_due_on}. Le montant habituel reste {money(charge.amount, currency)}.
        </p>
      ) : null}
    </Sheet>
  );
}
