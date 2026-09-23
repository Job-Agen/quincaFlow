'use client';

import { use, useState } from 'react';
import { Check, XCircle, Info } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Button, Card, CardHead, Notice, Skeleton } from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { OOS_FLOW, OOS_STATUS_LABELS, flowIndex } from '@/domain/outOfStock';
import { dateTime, money, quantity } from '@/utils/format';

/**
 * Suivi d'une vente hors stock (maquette 6, §17).
 *
 * Le workflow est présenté comme une check-list qui avance d'un cran à la fois :
 * à récupérer → récupéré → client payé → vendeur payé → terminé. Chaque étape
 * correspond à un fait constatable, ce qui évite qu'une opération soit close
 * alors que le confrère n'a pas encore été payé.
 */
export default function OutOfStockDetailPage({ params }) {
  const { id } = use(params);
  const { currency } = useSession();
  const { data, loading, error, setData } = useResource(`/api/out-of-stock-sales/${id}`);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(null);

  const current = data ? flowIndex(data.status) : -1;
  const done = data?.status === 'COMPLETED' || data?.status === 'CANCELLED';

  async function moveTo(status) {
    setBusy(true);
    setIssue(null);
    try {
      setData(await api.patch(`/api/out-of-stock-sales/${id}`, { status }));
    } catch (error_) {
      setIssue(error_.message);
    }
    setBusy(false);
  }

  return (
    <>
      <AppBar back="/out-of-stock" title="Vente hors stock" />

      <main className="page page--oos">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {issue ? <Notice tone="error">{issue}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={110} /> : null}

        {data ? (
          <>
            <Notice icon={<Info size={21} style={{ flexShrink: 0 }} />}>
              Produit non disponible en stock, mais que vous pouvez obtenir chez un autre vendeur.
            </Notice>
            <div className="stack oos-summary">
              <label className="field">
                <span className="field__label">Produit</span>
                <input className="input" value={data.product_name} readOnly />
              </label>
              <label className="field">
                <span className="field__label">Autre vendeur</span>
                <input className="input" value={data.other_seller || '—'} readOnly />
              </label>
              <label className="field">
                <span className="field__label">Coût d’achat</span>
                <input className="input" value={money(data.cost_price, currency)} readOnly />
              </label>
              <div className="total-line">
                <span className="strong">Prix de vente client</span>
                <span>{money(data.selling_price, currency)}</span>
              </div>
              <div className="total-line oos-margin">
                <strong>Marge brute</strong>
                <strong>{money(data.gross_margin, currency)}</strong>
              </div>
              {data.status === 'CANCELLED' ? <Badge tone="grey">Annulée</Badge> : null}
            </div>

            <Card>
              <CardHead title="Statut de l'opération" />
              <div className="stack" style={{ padding: '8px 16px 16px' }}>
                <div className="steps">
                  {OOS_FLOW.map((status, index) => {
                    if (index === 0 && current > 0) return null;
                    const state =
                      data.status === 'CANCELLED'
                        ? 'todo'
                        : index <= current
                          ? 'done'
                          : index === current + 1
                            ? 'current'
                            : 'todo';
                    return (
                      <div key={status} className="step" data-state={state}>
                        <span className="step__dot">
                          {state === 'done' ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                        <span>{OOS_STATUS_LABELS[status]}</span>
                      </div>
                    );
                  })}
                </div>

                {!done ? (
                  <>
                    <Button
                      variant="primary"
                      block
                      disabled={busy}
                      onClick={() => moveTo(OOS_FLOW[current + 1])}
                    >
                      {busy
                        ? 'Enregistrement…'
                        : `Marquer : ${OOS_STATUS_LABELS[OOS_FLOW[current + 1]]}`}
                    </Button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--block"
                      style={{ color: 'var(--red)' }}
                      disabled={busy}
                      onClick={() => moveTo('CANCELLED')}
                    >
                      <XCircle size={17} />
                      Annuler l&apos;opération
                    </button>
                  </>
                ) : null}
              </div>
            </Card>

            <details className="additional-details">
              <summary>Détails de l’opération</summary>
              <div className="stack">
                <span>
                  {data.reference} · {dateTime(data.created_at)}
                </span>
                <span>Client : {data.customer_name || 'Client comptoir'}</span>
                <span>Quantité : {quantity(data.quantity)}</span>
                {data.note ? <p>{data.note}</p> : null}
                <p className="small muted">
                  Le produit récupéré pour ce client ne modifie pas votre stock.
                </p>
              </div>
            </details>
          </>
        ) : null}
      </main>
    </>
  );
}
