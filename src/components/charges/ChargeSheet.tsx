'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Notice, SelectField, Sheet, TextAreaField, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/domain/report';
import { MOIS_MAX, MOIS_MIN, phrasePeriode, prochaineEcheance, type ChargeRow } from '@/domain/charge';
import { money, shortDate } from '@/utils/format';
import { errorMessage } from '@/utils/errors';

/** Aujourd'hui en `YYYY-MM-DD`, comme la base la range. */
const aujourdhui = () => {
  const jour = new Date();
  return `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(
    jour.getDate()
  ).padStart(2, '0')}`;
};

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
    intervalMonths: charge?.interval_months ?? 1,
    paidOn: charge?.last_paid_on || aujourdhui(),
    note: charge?.note || '',
  });
  const [avecDepense, setAvecDepense] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const set = (champ: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [champ]: event.target.value });

  // Calculée ici par la même fonction que le serveur : annoncer une date puis
  // en écrire une autre vaudrait mieux ne rien annoncer.
  const echeance = prochaineEcheance(
    form.paidOn || aujourdhui(),
    Number(form.intervalMonths) || 1
  );

  async function enregistrer() {
    setBusy(true);
    setErreur(null);
    try {
      if (charge) await api.put(`/api/charges/${charge.id}`, { ...form, active: charge.active });
      else await api.post('/api/charges', { ...form, enregistrerDepense: avecDepense });
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

      {/* Trois nombres, et l'échéance s'en déduit (§67). Le gérant ne choisit
        pas de date : il dit ce qu'il a fait — payé tel jour, tel montant — et
        tous les combien cela revient. C'est au calcul de compter les mois. */}
      <div className="grid-2">
        <TextField
          label={`Montant payé (${currency})`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          hint="Modifiable à chaque paiement."
          value={form.amount}
          onChange={set('amount')}
          required
        />
        <TextField
          label="Revient tous les… (mois)"
          type="number"
          inputMode="numeric"
          min={MOIS_MIN}
          max={MOIS_MAX}
          step="1"
          hint={phrasePeriode(Number(form.intervalMonths) || 1).toLowerCase()}
          value={form.intervalMonths}
          onChange={set('intervalMonths')}
        />
      </div>

      <TextField
        label="Payé le"
        type="date"
        hint="C’est de ce jour que part le compte à rebours."
        value={form.paidOn}
        onChange={set('paidOn')}
      />

      <Notice>
        Prochaine échéance : <strong>{shortDate(echeance)}</strong>.
        {charge ? null : (
          <>
            {' '}
            Une dépense de {money(Number(form.amount) || 0, currency)} du{' '}
            {shortDate(form.paidOn || aujourdhui())} sera enregistrée au poste de cette charge.
          </>
        )}
      </Notice>

      {charge ? null : (
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={avecDepense}
            onChange={(event) => setAvecDepense(event.target.checked)}
          />
          <span className="small">
            Enregistrer aussi la dépense. Décochez si vous l’avez déjà saisie à la main.
          </span>
        </label>
      )}

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
          {shortDate(charge.next_due_on)}. Le montant habituel reste{' '}
          {money(charge.amount, currency)}.
        </p>
      ) : null}
    </Sheet>
  );
}
