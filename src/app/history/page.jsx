'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftRight, ChevronRight, PackageCheck, Receipt, Truck } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Card, Empty, Notice, SearchField, Segmented, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { OOS_STATUS_LABELS } from '@/domain/outOfStock';
import { PO_STATUS_LABELS, PO_STATUS_TONES } from '@/domain/purchase';
import { dayLabel, money, time } from '@/utils/format';

/**
 * Historique (maquette 9, §24).
 *
 * Le commerçant ne raisonne pas par table : il cherche « ce qui s'est passé
 * mardi ». Ventes, ventes hors stock, commandes et réceptions arrivent donc dans
 * un même flux, groupé par jour, filtrable par nature et par période.
 */

const PERIODS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
];

const KINDS = [
  { value: '', label: 'Tout' },
  { value: 'SALE', label: 'Ventes' },
  { value: 'OUT_OF_STOCK', label: 'Hors stock' },
  { value: 'PURCHASE_ORDER', label: 'Commandes' },
  { value: 'RECEIPT', label: 'Réceptions' },
];

const SHAPES = {
  SALE: { icon: Receipt, label: 'Vente', href: (entry) => `/sales/${entry.id}` },
  OUT_OF_STOCK: {
    icon: ArrowLeftRight,
    label: 'Hors stock',
    href: (entry) => `/out-of-stock/${entry.id}`,
  },
  PURCHASE_ORDER: { icon: Truck, label: 'Commande', href: (entry) => `/purchases/${entry.id}` },
  RECEIPT: { icon: PackageCheck, label: 'Réception', href: null },
};

/** Badge adapté à la nature de l'opération : chaque flux a ses propres statuts. */
function statusBadge(entry) {
  if (entry.kind === 'SALE') {
    return entry.status === 'CANCELLED' ? (
      <Badge tone="red">Annulée</Badge>
    ) : (
      <Badge tone="green">Validée</Badge>
    );
  }
  if (entry.kind === 'OUT_OF_STOCK') {
    return (
      <Badge
        tone={
          entry.status === 'COMPLETED' ? 'green' : entry.status === 'CANCELLED' ? 'grey' : 'amber'
        }
      >
        {OOS_STATUS_LABELS[entry.status]}
      </Badge>
    );
  }
  if (entry.kind === 'PURCHASE_ORDER') {
    return <Badge tone={PO_STATUS_TONES[entry.status]}>{PO_STATUS_LABELS[entry.status]}</Badge>;
  }
  return <Badge tone="green">Reçue</Badge>;
}

function HistoryView() {
  const params = useSearchParams();
  const { currency } = useSession();
  const [period, setPeriod] = useState('7d');
  // La nature vient de l'URL : /sales redirige ici en pré-filtrant sur les ventes.
  const [kind, setKind] = useState(params.get('kind') || '');
  const [search, setSearch] = useState('');

  const { data, loading, error } = useResource('/api/history', { period, kind, search });

  // Le regroupement par jour est fait à l'affichage : le serveur renvoie un flux
  // trié, et découper ici évite une seconde requête par journée affichée.
  const days = [];
  (data || []).forEach((entry) => {
    const label = dayLabel(entry.created_at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  });

  return (
    <>
      <AppBar back="/more" title="Historique" />

      <main className="page">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Référence, client, produit…"
        />
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented options={KINDS} value={kind} onChange={setKind} />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={5} height={64} /> : null}

        {data && data.length === 0 ? (
          <Card>
            <Empty
              icon={<Receipt size={26} className="muted" />}
              title="Aucune opération"
              hint="Élargissez la période ou changez de filtre."
            />
          </Card>
        ) : null}

        {days.map((day) => (
          <div key={day.label} className="stack" style={{ gap: 8 }}>
            <span className="section-title small muted">{day.label}</span>
            <Card>
              <div className="list">
                {day.entries.map((entry) => {
                  const shape = SHAPES[entry.kind];
                  const Icon = shape.icon;
                  const href = shape.href?.(entry);
                  const Tag = href ? Link : 'div';
                  return (
                    <Tag key={`${entry.kind}-${entry.id}`} href={href} className="list__row">
                      <span className="thumb">
                        <Icon size={19} />
                      </span>
                      <div className="list__body">
                        <div className="list__title">{entry.reference}</div>
                        <div className="list__sub">
                          {shape.label} · {time(entry.created_at)}
                          {entry.party ? ` · ${entry.party}` : ''}
                        </div>
                      </div>
                      <div className="list__end">
                        <strong className="num">{money(entry.amount, currency)}</strong>
                        {statusBadge(entry)}
                      </div>
                      {href ? <ChevronRight size={18} className="muted" /> : null}
                    </Tag>
                  );
                })}
              </div>
            </Card>
          </div>
        ))}
      </main>
    </>
  );
}

export default function HistoryPage() {
  // useSearchParams suspend au premier rendu : la limite est posée ici pour que
  // la lecture de l'URL ne fasse pas disparaître le reste de la page.
  return (
    <Suspense fallback={<Skeleton count={5} height={64} />}>
      <HistoryView />
    </Suspense>
  );
}
