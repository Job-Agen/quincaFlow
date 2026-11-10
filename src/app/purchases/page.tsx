'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, SlidersHorizontal, Truck } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Badge,
  Card,
  Empty,
  Notice,
  SearchField,
  Segmented,
  Sheet,
  Skeleton,
} from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { PO_STATUS_LABELS, PO_STATUS_TONES } from '@/domain/purchase';
import { dayLabel, money } from '@/utils/format';
import type { PurchaseOrderRow } from '@/types';

/**
 * Ce que le gérant cherche dans sa liste de commandes (§58).
 *
 * Trois questions, pas sept statuts : qu'est-ce qui court encore, qu'est-ce qui
 * est arrivé, qu'est-ce que j'ai annulé. « En cours » vient en premier parce
 * que c'est la seule qui demande une action.
 */
const STATUTS = [
  { value: 'ouvertes', label: 'En cours' },
  { value: 'livrees', label: 'Livrées' },
  { value: 'annulees', label: 'Annulées' },
  { value: '', label: 'Toutes' },
];

const PERIODES = [
  { value: 'all', label: 'Tout' },
  { value: '30d', label: '30 jours' },
  { value: 'month', label: 'Ce mois' },
  { value: 'last-month', label: 'Mois dernier' },
];

export default function PurchasesPage() {
  const { currency, isOwner } = useSession();
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [period, setPeriod] = useState('all');
  const [filtres, setFiltres] = useState(false);
  const { data, loading, error } = useResource<PurchaseOrderRow[]>('/api/purchase-orders', {
    search,
    statut,
    period,
  });

  return (
    <>
      <AppBar back="/dashboard" title="Achats fournisseurs" />

      <main className="page page--fab">
        <div className="filter-row">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Référence ou fournisseur…"
          />
          <button
            type="button"
            className="filter-toggle"
            aria-label="Filtrer les commandes"
            aria-expanded={filtres}
            onClick={() => setFiltres(true)}
          >
            <SlidersHorizontal size={21} />
          </button>
        </div>

        <Sheet open={filtres} title="Filtrer les commandes" onClose={() => setFiltres(false)}>
          <span className="field__label">État</span>
          <Segmented options={STATUTS} value={statut} onChange={setStatut} />
          <span className="field__label">Période</span>
          <Segmented wrap options={PERIODES} value={period} onChange={setPeriod} />
          <button type="button" className="btn" onClick={() => setFiltres(false)}>
            Afficher les commandes
          </button>
        </Sheet>

        <Segmented options={STATUTS} value={statut} onChange={setStatut} />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={68} /> : null}

        {data ? (
          <Card>
            {data.length === 0 ? (
              <Empty
                icon={<Truck size={26} className="muted" />}
                title="Aucune commande"
                hint={
                  // Un filtre actif explique le vide. Sans cela, le gérant qui
                  // filtre sur « Annulées » croit avoir perdu ses commandes.
                  statut || period !== 'all' || search
                    ? 'Aucune commande ne correspond à ce filtre.'
                    : "Créez une commande fournisseur ; le stock n'augmentera qu'à la réception."
                }
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
