'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { HandCoins, MessageCircle, Pencil, Phone, Receipt, Wallet } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import RepaymentSheet from '@/components/credit/RepaymentSheet';
import ContactSheet from '@/components/contacts/ContactSheet';
import { Badge, Button, Card, CardHead, Empty, Notice, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { reminderMessage, saleBalance, whatsappLink } from '@/domain/credit';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/domain/sale';
import { amount, dateTime, money, shortDate } from '@/utils/format';
import type { CustomerAccount } from '@/types';

/**
 * Fiche client et carnet de crédit (§45).
 *
 * Elle répond, dans cet ordre, aux trois questions que le gérant se pose devant
 * un client qui entre : combien me doit-il, depuis quand, et qu'a-t-il acheté ?
 * Le solde dû est donc en haut, avant l'historique — et non pas calculé de tête
 * en faisant défiler des ventes.
 */
export default function CustomerAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { currency, business } = useSession();
  const { data, loading, error, reload } = useResource<CustomerAccount>(
    `/api/customers/${id}/account`
  );
  const [encaissant, setEncaissant] = useState(false);
  const [modifiant, setModifiant] = useState(false);

  const client = data?.customer;
  const relance =
    data && client
      ? whatsappLink(
          client.phone,
          reminderMessage({
            customerName: client.name,
            businessName: business?.name || 'la quincaillerie',
            owed: data.owed,
            currency,
            openCount: data.openCount,
          })
        )
      : null;

  const impayees = (data?.sales ?? []).filter(
    (vente) => vente.status === 'COMPLETED' && saleBalance(vente.total, vente.amount_paid) > 0
  );

  return (
    <>
      <AppBar
        back="/customers"
        title={client?.name || 'Fiche client'}
        right={
          client ? (
            <button
              type="button"
              className="appbar__icon"
              aria-label="Modifier la fiche"
              onClick={() => setModifiant(true)}
            >
              <Pencil size={19} />
            </button>
          ) : null
        }
      />

      <main className="page">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={88} /> : null}

        {data && client ? (
          <>
            <Card pad>
              <div className="account__head">
                <span className="account__initial" aria-hidden="true">
                  {client.name.charAt(0).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="list__title">{client.name}</div>
                  {client.phone ? (
                    <a className="list__sub link" href={`tel:${client.phone}`}>
                      <Phone size={12} style={{ verticalAlign: -1 }} /> {client.phone}
                    </a>
                  ) : (
                    <div className="list__sub muted">Sans téléphone</div>
                  )}
                </div>
              </div>
            </Card>

            <div className="tiles">
              <div className="tile tile--blue">
                <span className="tile__label">
                  Total acheté
                  <Receipt size={16} />
                </span>
                <span className="tile__value num">{amount(data.spent, 0)}</span>
                <span className="tile__unit">{currency}</span>
              </div>
              <div className={`tile ${data.owed > 0 ? 'tile--amber' : 'tile--green'}`}>
                <span className="tile__label">
                  Solde dû
                  <Wallet size={16} />
                </span>
                <span className="tile__value num">{amount(data.owed, 0)}</span>
                <span className="tile__unit">{currency}</span>
              </div>
            </div>

            {data.owed > 0 ? (
              <>
                <p className="small muted">
                  {data.openCount === 1
                    ? 'Un achat non soldé'
                    : `${data.openCount} achats non soldés`}
                  {data.oldestOpenAt ? `, le plus ancien du ${shortDate(data.oldestOpenAt)}` : ''}.
                </p>
                <Button block onClick={() => setEncaissant(true)}>
                  <HandCoins size={18} />
                  Enregistrer un remboursement
                </Button>
                {relance ? (
                  <a
                    className="btn btn--whatsapp btn--block"
                    href={relance}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={18} />
                    Relancer sur WhatsApp
                  </a>
                ) : (
                  <p className="small muted">
                    Ajoutez un numéro de téléphone à la fiche pour pouvoir relancer par WhatsApp.
                  </p>
                )}
              </>
            ) : (
              <Notice tone="success">Ce client ne doit rien.</Notice>
            )}

            {impayees.length ? (
              <Card>
                <CardHead title="Achats non soldés" />
                <div className="list">
                  {impayees.map((vente) => (
                    <Link key={vente.id} href={`/sales/${vente.id}`} className="list__row">
                      <div className="list__body">
                        <div className="list__title">#{vente.reference}</div>
                        <div className="list__sub">{shortDate(vente.created_at)}</div>
                        <div className="list__sub">
                          {money(vente.amount_paid, currency)} réglés sur{' '}
                          {money(vente.total, currency)}
                        </div>
                      </div>
                      <div className="list__end">
                        <strong className="num">
                          {money(saleBalance(vente.total, vente.amount_paid), currency)}
                        </strong>
                        <Badge tone={vente.payment_status === 'UNPAID' ? 'red' : 'amber'}>
                          {PAYMENT_STATUS_LABELS[vente.payment_status]}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card>
              <CardHead title="Versements" />
              {data.payments.length === 0 ? (
                <Empty
                  icon={<HandCoins size={26} className="muted" />}
                  title="Aucun versement"
                  hint="Les encaissements de ce client apparaîtront ici."
                />
              ) : (
                <div className="list">
                  {data.payments.map((versement) => (
                    <div key={versement.id} className="list__row">
                      <div className="list__body">
                        <div className="list__title">
                          {versement.kind === 'REPAYMENT' ? 'Remboursement' : 'Payé au comptoir'} ·{' '}
                          {versement.sale_reference}
                        </div>
                        <div className="list__sub">
                          {dateTime(versement.created_at)} ·{' '}
                          {PAYMENT_METHOD_LABELS[versement.method]}
                        </div>
                        {versement.note ? <div className="list__sub">{versement.note}</div> : null}
                      </div>
                      <div className="list__end">
                        <strong className="num">{money(versement.amount, currency)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Quand toutes les ventes du client sont impayées, cette carte
              répéterait mot pour mot celle du dessus : elle ne s'affiche que si
              elle a quelque chose de plus à montrer. */}
            {data.sales.length > impayees.length ? (
              <Card>
                <CardHead title="Tous les achats" />
                <div className="list">
                  {data.sales.map((vente) => (
                    <Link key={vente.id} href={`/sales/${vente.id}`} className="list__row">
                      <div className="list__body">
                        <div className="list__title">#{vente.reference}</div>
                        <div className="list__sub">{shortDate(vente.created_at)}</div>
                      </div>
                      <div className="list__end">
                        <strong className="num">{money(vente.total, currency)}</strong>
                        {vente.status === 'CANCELLED' ? (
                          <Badge tone="grey">Annulée</Badge>
                        ) : vente.payment_status === 'PAID' ? (
                          <Badge tone="green">Payée</Badge>
                        ) : (
                          <Badge tone={vente.payment_status === 'UNPAID' ? 'red' : 'amber'}>
                            {PAYMENT_STATUS_LABELS[vente.payment_status]}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            ) : null}

            {data.sales.length === 0 ? (
              <Card>
                <Empty
                  icon={<Receipt size={26} className="muted" />}
                  title="Aucun achat"
                  hint="Les ventes faites à ce client apparaîtront ici."
                />
              </Card>
            ) : null}
          </>
        ) : null}
      </main>

      {modifiant && client ? (
        <ContactSheet
          kind="customers"
          contact={client}
          addLabel="Nouveau client"
          onClose={() => setModifiant(false)}
          onSaved={() => {
            setModifiant(false);
            reload();
          }}
        />
      ) : null}

      {encaissant && data ? (
        <RepaymentSheet
          customerId={id}
          owed={data.owed}
          currency={currency}
          onClose={() => setEncaissant(false)}
          onSaved={() => {
            setEncaissant(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
