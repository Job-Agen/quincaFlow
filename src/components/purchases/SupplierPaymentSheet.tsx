'use client';

import { useState } from 'react';
import { Button, Notice, Segmented, Sheet, TextAreaField, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { tooMuch } from '@/domain/supplierDebt';
import {
  MOBILE_MONEY_PROVIDERS,
  MOBILE_MONEY_PROVIDER_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from '@/domain/sale';
import { money } from '@/utils/format';
import { toNumber } from '@/utils/money';
import { errorMessage } from '@/utils/errors';
import type { MobileMoneyProvider, PaymentMethod, PurchaseOrder } from '@/types';

/**
 * Règlement d'une commande fournisseur (§53).
 *
 * C'est le miroir du remboursement client (§45), et il en reprend les gestes :
 * un montant, « tout solder » parce que c'est le cas le plus fréquent, un motif
 * facultatif. Le dépassement est signalé ici *et* refusé par le serveur — ici
 * pour que le gérant le voie avant d'appuyer, là-bas parce qu'un écran n'est
 * pas un garde-fou.
 */
export default function SupplierPaymentSheet({
  orderId,
  owed,
  currency,
  onClose,
  onSaved,
}: {
  orderId: string;
  owed: number;
  currency: string;
  onClose: () => void;
  onSaved: (order: PurchaseOrder) => void;
}) {
  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [operateur, setOperateur] = useState<MobileMoneyProvider>('TMONEY');
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
        await api.post<PurchaseOrder>(`/api/purchase-orders/${orderId}/payments`, {
          amount: verse,
          method: methode,
          provider: methode === 'MOBILE_MONEY' ? operateur : null,
          note: motif,
        })
      );
    } catch (issue) {
      setError(errorMessage(issue));
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Régler le fournisseur" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <p className="small muted">Reste à payer sur le livré : {money(owed, currency)}</p>

      <TextField
        label={`Montant versé (${currency})`}
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
          Ce versement dépasse ce qui reste dû. Saisissez au plus {money(owed, currency)}.
        </Notice>
      ) : verse > 0 ? (
        <p className="small muted">
          {reste > 0 ? `Restera ${money(reste, currency)} à payer.` : 'La commande sera soldée.'}
        </p>
      ) : null}

      <span className="field__label">Payé en</span>
      <Segmented
        options={PAYMENT_METHODS.map((methodePossible) => ({
          value: methodePossible,
          label: PAYMENT_METHOD_LABELS[methodePossible],
        }))}
        value={methode}
        onChange={setMethode}
      />

      {methode === 'MOBILE_MONEY' ? (
        <>
          <span className="field__label">Opérateur</span>
          <Segmented
            wrap
            options={MOBILE_MONEY_PROVIDERS.map((operateurPossible) => ({
              value: operateurPossible,
              label: MOBILE_MONEY_PROVIDER_LABELS[operateurPossible],
            }))}
            value={operateur}
            onChange={setOperateur}
          />
        </>
      ) : null}

      <TextAreaField
        label="Motif (facultatif)"
        rows={2}
        placeholder="Acompte livraison, solde de fin de mois…"
        value={motif}
        onChange={(event) => setMotif(event.target.value)}
      />

      <Button block disabled={busy || verse <= 0 || excessif} onClick={enregistrer}>
        {busy ? 'Enregistrement…' : 'Enregistrer le règlement'}
      </Button>
    </Sheet>
  );
}
