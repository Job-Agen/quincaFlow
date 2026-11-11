'use client';

import { useState } from 'react';
import { Banknote } from 'lucide-react';
import { Button, Notice, Sheet, TextAreaField, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import {
  phraseEcheance,
  phrasePeriode,
  prochaineEcheance,
  type ChargeRow,
} from '@/domain/charge';
import { money, shortDate } from '@/utils/format';
import { errorMessage } from '@/utils/errors';

/**
 * Enregistrer le paiement d'une charge (§66).
 *
 * Le geste du gérant : « j'ai payé le loyer ». Deux choses en découlent, et
 * la feuille les annonce toutes les deux avant de les faire — une dépense
 * entre dans les comptes, et le chrono repart. La seconde surprend si on la
 * tait : le gérant ne verrait pas pourquoi l'échéance a bougé.
 */
const aujourdhui = () => {
  const jour = new Date();
  return `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(
    jour.getDate()
  ).padStart(2, '0')}`;
};

export default function PaiementChargeSheet({
  charge,
  onClose,
  onPayee,
}: {
  charge: ChargeRow;
  onClose: () => void;
  onPayee: () => void;
}) {
  const { currency } = useSession();
  const [montant, setMontant] = useState<number | string>(charge.amount || '');
  const [paye, setPaye] = useState(aujourdhui());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Calculée ici aussi, par la même fonction que le serveur : annoncer une
  // date puis en écrire une autre vaudrait mieux ne rien annoncer.
  const suivante = prochaineEcheance(paye || aujourdhui(), charge.interval_months);

  async function payer() {
    setBusy(true);
    setErreur(null);
    try {
      await api.post(`/api/charges/${charge.id}/pay`, { amount: montant, paidOn: paye, note });
      onPayee();
    } catch (souci) {
      setErreur(errorMessage(souci));
      setBusy(false);
    }
  }

  return (
    <Sheet open title={`Payer ${charge.label}`} onClose={onClose}>
      {erreur ? <Notice tone="error">{erreur}</Notice> : null}

      <p className="small muted">
        Échéance : {shortDate(charge.next_due_on)} ·{' '}
        {phraseEcheance(charge.next_due_on, aujourdhui()).toLowerCase()}
      </p>

      <div className="grid-2">
        <TextField
          label={`Montant payé (${currency})`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={montant}
          onChange={(event) => setMontant(event.target.value)}
        />
        <TextField
          label="Payé le"
          type="date"
          value={paye}
          onChange={(event) => setPaye(event.target.value)}
        />
      </div>

      <TextAreaField
        label="Note (optionnel)"
        rows={2}
        placeholder="Quittance n° 42, payé en espèces…"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <Notice tone="info">
        Une dépense de {money(Number(montant) || 0, currency)} sera enregistrée au poste de cette
        charge, et la prochaine échéance passera au <strong>{shortDate(suivante)}</strong> —{' '}
        {phrasePeriode(charge.interval_months).toLowerCase()} à compter du jour du paiement.
      </Notice>

      <Button block disabled={busy} onClick={payer}>
        <Banknote size={19} />
        {busy ? 'Enregistrement…' : 'Enregistrer le paiement'}
      </Button>
    </Sheet>
  );
}
