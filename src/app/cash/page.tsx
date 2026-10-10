'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Info, Receipt, Wallet } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Card, CardHead, Empty, Notice, Segmented, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { dayLabel, money, time } from '@/utils/format';
import type { CashEntryWithBalance, CashJournal } from '@/types';

/**
 * Journal de caisse (§40).
 *
 * Le §39 dit combien la boutique a gagné ; celui-ci dit où l'argent est passé. Un
 * mois de gros réassort vide la caisse tout en étant rentable, et le commerçant
 * qui ne voit que sa marge ne comprend pas pourquoi son tiroir est vide.
 *
 * Entrées et sorties vivent dans un seul flux, groupé par jour comme
 * l'historique (§24) : c'est ainsi qu'on tient un cahier de caisse, pas en
 * feuilletant deux listes séparées.
 */

const PERIODS = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last-month', label: 'Mois dernier' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
];

const DIRECTIONS = [
  { value: '', label: 'Tout' },
  { value: 'IN', label: 'Entrées' },
  { value: 'OUT', label: 'Sorties' },
];

export default function CashPage() {
  const { currency, isOwner } = useSession();
  const [period, setPeriod] = useState('month');
  const [direction, setDirection] = useState('');

  const { data, loading, error } = useResource<CashJournal>('/api/cash', { period, direction });

  // Le regroupement par jour est fait à l'affichage : le serveur rend un flux
  // trié, et découper ici évite une requête par journée affichée.
  const days: { label: string; entries: CashEntryWithBalance[] }[] = [];
  (data?.entries || []).forEach((entry) => {
    const label = dayLabel(entry.occurredAt);
    const last = days[days.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  });

  return (
    <>
      <AppBar
        back="/more"
        title="Journal de caisse"
        right={
          <Link href="/expenses" className="appbar__icon" aria-label="Dépenses">
            <Receipt size={21} />
          </Link>
        }
      />

      <main className="page">
        {!isOwner ? (
          <Notice tone="warn">Seul le propriétaire consulte le journal de caisse.</Notice>
        ) : null}

        <Segmented options={PERIODS} value={period} onChange={setPeriod} />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={64} /> : null}

        {data ? (
          <>
            <Card pad>
              <div className="cash-totals">
                <div>
                  <span className="cash-totals__label">Entrées</span>
                  <span className="num cash-in">{money(data.cashIn, currency)}</span>
                </div>
                <div>
                  <span className="cash-totals__label">Sorties</span>
                  <span className="num cash-out">{money(data.cashOut, currency)}</span>
                </div>
                <div>
                  <span className="cash-totals__label">Solde</span>
                  <span className={`num${data.balance < 0 ? ' cash-out' : ''}`}>
                    {money(data.balance, currency)}
                  </span>
                </div>
              </div>
              {/* Dire ce que le solde vaut : sans solde d'ouverture, ce n'est pas
                  le contenu du tiroir, et le laisser croire serait pire que rien. */}
              <Notice icon={<Info size={17} />}>
                Ce solde est celui des opérations de la période — encaissements moins dépenses. Ce
                n’est pas le fond de caisse : QuincaFlow ne connaît pas ce que contenait le tiroir
                au départ.
              </Notice>
            </Card>

            <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} />

            {data.entries.length === 0 ? (
              <Card>
                <Empty
                  icon={<Wallet size={26} className="muted" />}
                  title="Aucun mouvement"
                  hint="Les encaissements de vos ventes et vos dépenses apparaîtront ici."
                />
              </Card>
            ) : null}

            {days.map((day) => (
              <Card key={day.label}>
                <CardHead title={day.label} />
                <div className="list">
                  {day.entries.map((entry) => {
                    const entrant = entry.direction === 'IN';
                    const body = (
                      <>
                        <span
                          className={`cash-row__icon cash-row__icon--${entrant ? 'in' : 'out'}`}
                          aria-hidden="true"
                        >
                          {entrant ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                        </span>
                        <div className="list__body">
                          <div className="list__title">{entry.label}</div>
                          <div className="list__sub">
                            {time(entry.occurredAt)} · {entry.detail}
                          </div>
                        </div>
                        <div className="list__end">
                          {/* Le signe porte le sens autant que la couleur : un
                              journal doit se tenir sans distinguer le vert du rouge. */}
                          <strong className={`num ${entrant ? 'cash-in' : 'cash-out'}`}>
                            {entrant ? '+' : '−'} {money(entry.amount, currency)}
                          </strong>
                          <span className="cash-row__balance num">
                            solde {money(entry.balance, currency)}
                          </span>
                        </div>
                      </>
                    );

                    return entry.saleId ? (
                      <Link key={entry.id} href={`/sales/${entry.saleId}`} className="list__row">
                        {body}
                      </Link>
                    ) : (
                      <div key={entry.id} className="list__row">
                        {body}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            {data.truncated ? (
              <Notice tone="warn">
                Seuls les mouvements les plus récents de la période sont affichés. Les totaux du
                haut, eux, portent sur toute la période.
              </Notice>
            ) : null}
          </>
        ) : null}
      </main>
    </>
  );
}
