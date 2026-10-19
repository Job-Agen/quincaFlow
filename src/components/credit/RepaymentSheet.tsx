'use client';

import { useState } from 'react';
import { Button, Notice, Segmented, Sheet, TextAreaField, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { tooMuch } from '@/domain/credit';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/domain/sale';
import { money } from '@/utils/format';
import { toNumber } from '@/utils/money';
import { errorMessage } from '@/utils/errors';
import type { CustomerAccount, PaymentMethod } from '@/types';

/**
 * Saisie d'un remboursement (§45).
 *
 * Le gérant saisit une somme, jamais une répartition : au comptoir, le client
 * pose un billet sur le carnet, il ne désigne pas une facture. Le serveur
 * impute à la plus vieille ardoise d'abord.
 *
 * « Tout solder » existe parce que c'est le cas le plus fréquent, et parce que
 * retaper 47 500 de tête est le meilleur moyen de taper 4 750.
 *
 * Le dépassement est signalé ici *et* refusé par le serveur. Ici pour que le
 * gérant le voie avant d'appuyer ; là-bas parce qu'un écran n'est pas un
 * garde-fou — deux vendeurs peuvent encaisser la même dette en même temps.
 */
export default function RepaymentSheet({
  customerId,
  owed,
  currency,
  onClose,
  onSaved,
}: {
  customerId: string;
  owed: number;
  currency: string;
  onClose: () => void;
  onSaved: (account: CustomerAccount) => void;
}) {
  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verse = toNumber(montant);
  const excessif = verse > 0 && tooMuch(verse, owed);
  const reste = Math.max(0, owed - verse);

  async function enregistrer() {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api.post<CustomerAccount>(`/api/customers/${customerId}/repayments`, {
          amount: verse,
          method: methode,
          note: motif,
        })
      );
    } catch (issue) {
      setError(errorMessage(issue));
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Remboursement" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <p className="small muted">Dette en cours : {money(owed, currency)}</p>

      <TextField
        label={`Montant reçu (${currency})`}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={montant}
        onChange={(event) => setMontant(event.target.value)}
      />
      <Button variant="soft" size="sm" onClick={() => setMontant(String(owed))}>
        Tout solder · {money(owed, currency)}
      </Button>

      {excessif ? (
        <Notice tone="warn">
          Ce versement dépasse la dette. Saisissez au plus {money(owed, currency)}.
        </Notice>
      ) : verse > 0 ? (
        <p className="small muted">
          {reste > 0 ? `Restera ${money(reste, currency)} à régler.` : 'La dette sera soldée.'}
        </p>
      ) : null}

      <span className="field__label">Reçu en</span>
      <Segmented
        options={PAYMENT_METHODS.map((methodePossible) => ({
          value: methodePossible,
          label: PAYMENT_METHOD_LABELS[methodePossible],
        }))}
        value={methode}
        onChange={setMethode}
      />

      <TextAreaField
        label="Motif (facultatif)"
        rows={2}
        placeholder="Vente de sa récolte, avance sur chantier…"
        value={motif}
        onChange={(event) => setMotif(event.target.value)}
      />

      <Button block disabled={busy || verse <= 0 || excessif} onClick={enregistrer}>
        {busy ? 'Enregistrement…' : 'Enregistrer le remboursement'}
      </Button>
    </Sheet>
  );
}
