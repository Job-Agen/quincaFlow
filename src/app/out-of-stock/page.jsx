'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ChevronRight, Plus } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Card, Empty, Notice, SearchField, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { OOS_STATUS_LABELS } from '@/domain/outOfStock';
import { dayLabel, money } from '@/utils/format';

/** Couleur du statut : vert quand l'opération est soldée, ambre tant qu'elle court. */
const TONES = {
  COMPLETED: 'green',
  CANCELLED: 'grey',
  SELLER_PAID: 'blue',
  CUSTOMER_PAID: 'blue',
};

export default function OutOfStockPage() {
  const { currency } = useSession();
  const [search, setSearch] = useState('');
  const { data, loading, error } = useResource('/api/out-of-stock-sales', { search });

  return (
    <>
      <AppBar back="/" title="Ventes hors stock" />

      <main className="page">
        <SearchField value={search} onChange={setSearch} placeholder="Produit, client, vendeur…" />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={68} /> : null}

        {data ? (
          <Card>
            {data.length === 0 ? (
              <Empty
                icon={<ArrowLeftRight size={26} className="muted" />}
                title="Aucune vente hors stock"
                hint="Enregistrez ici les articles que vous récupérez chez un confrère pour un client."
              />
            ) : (
              <div className="list">
                {data.map((entry) => (
                  <Link key={entry.id} href={`/out-of-stock/${entry.id}`} className="list__row">
                    <div className="list__body">
                      <div className="list__title">{entry.product_name}</div>
                      <div className="list__sub">
                        {entry.reference} · {dayLabel(entry.created_at)}
                        {entry.other_seller ? ` · ${entry.other_seller}` : ''}
                      </div>
                    </div>
                    <div className="list__end">
                      <strong className="num">
                        {money(entry.selling_price * entry.quantity, currency)}
                      </strong>
                      <Badge tone={TONES[entry.status] || 'amber'}>
                        {OOS_STATUS_LABELS[entry.status]}
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

      <Link href="/out-of-stock/new" className="fab" aria-label="Nouvelle vente hors stock">
        <Plus size={26} />
      </Link>
    </>
  );
}
