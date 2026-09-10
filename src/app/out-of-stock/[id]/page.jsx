'use client';

import { use, useState } from 'react';
import { Check, XCircle } from 'lucide-react';
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
      <AppBar back="/out-of-stock" title={data?.reference || 'Vente hors stock'} />

      <main className="page">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {issue ? <Notice tone="error">{issue}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={110} /> : null}

        {data ? (
          <>
            <Card pad className="stack">
              <div className="row row--between">
                <div>
                  <div className="strong" style={{ fontSize: 17 }}>
                    {data.product_name}
                  </div>
                  <div className="small muted">{dateTime(data.created_at)}</div>
                </div>
                <Badge tone={data.status === 'CANCELLED' ? 'grey' : done ? 'green' : 'amber'}>
                  {OOS_STATUS_LABELS[data.status]}
                </Badge>
              </div>

              <div className="stack" style={{ gap: 0 }}>
                <div className="total-line">
                  <span className="muted">Client</span>
                  <span>{data.customer_name || 'Client comptoir'}</span>
                </div>
                <div className="total-line">
                  <span className="muted">Autre vendeur</span>
                  <span>{data.other_seller || '—'}</span>
                </div>
                <div className="total-line">
                  <span className="muted">Quantité</span>
                  <span className="num">{quantity(data.quantity)}</span>
                </div>
                <div className="total-line">
                  <span className="muted">Coût d&apos;achat</span>
                  <span className="num">{money(data.cost_price, currency)}</span>
                </div>
                <div className="total-line">
                  <span className="muted">Prix client</span>
                  <span className="num">{money(data.selling_price, currency)}</span>
                </div>
                <div className="total-line total-line--grand">
                  <span>Marge brute</span>
                  <span className="num" style={{ color: 'var(--green-dark)' }}>
                    {money(data.gross_margin, currency)}
                  </span>
                </div>
              </div>

              {data.note ? <p className="small muted">{data.note}</p> : null}
            </Card>

            <Card>
              <CardHead title="Statut de l'opération" />
              <div className="stack" style={{ padding: '8px 16px 16px' }}>
                <div className="steps">
                  {OOS_FLOW.map((status, index) => {
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
                      variant="success"
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

            <Notice>
              Le produit récupéré pour cette commande n&apos;entre pas dans votre stock : il
              n&apos;a été acheté que pour ce client.
            </Notice>
          </>
        ) : null}
      </main>
    </>
  );
}
