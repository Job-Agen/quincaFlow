'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Truck } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Card, Empty, Notice, SearchField, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { PO_STATUS_LABELS, PO_STATUS_TONES } from '@/domain/purchase';
import { dayLabel, money } from '@/utils/format';

export default function PurchasesPage() {
  const { currency, isOwner } = useSession();
  const [search, setSearch] = useState('');
  const { data, loading, error } = useResource('/api/purchase-orders', { search });

  return (
    <>
      <AppBar back="/" title="Achats fournisseurs" />

      <main className="page">
        <SearchField value={search} onChange={setSearch} placeholder="Référence ou fournisseur…" />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={68} /> : null}

        {data ? (
          <Card>
            {data.length === 0 ? (
              <Empty
                icon={<Truck size={26} className="muted" />}
                title="Aucune commande"
                hint="Créez une commande fournisseur ; le stock n'augmentera qu'à la réception."
              />
            ) : (
              <div className="list">
                {data.map((order) => (
                  <Link key={order.id} href={`/purchases/${order.id}`} className="list__row">
                    <div className="list__body">
                      <div className="list__title">{order.supplier_name}</div>
                      <div className="list__sub">
                        {order.reference} · {dayLabel(order.created_at)}
                      </div>
                    </div>
                    <div className="list__end">
                      <strong className="num">{money(order.total_estimated, currency)}</strong>
                      <Badge tone={PO_STATUS_TONES[order.status]}>
                        {PO_STATUS_LABELS[order.status]}
                      </Badge>
                    </div>
                    <ChevronRight size={18} className="muted" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        ) : null}
      </main>

      {isOwner ? (
        <Link href="/purchases/new" className="fab" aria-label="Nouvelle commande">
          <Plus size={26} />
        </Link>
      ) : null}
    </>
  );
}
