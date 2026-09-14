'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Package, Plus } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Card, Empty, Notice, SearchField, Segmented, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { money, quantity } from '@/utils/format';

/**
 * Catalogue et stock (maquette 5).
 *
 * Le filtre est porté par l'URL : la tuile « stock faible » du tableau de bord
 * ouvre directement la bonne vue, et le gérant peut garder le lien.
 */

const FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'low', label: 'Stock faible' },
  { value: 'out', label: 'Rupture' },
];

function ProductsView() {
  const params = useSearchParams();
  const { currency, isOwner } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(params.get('filter') || 'all');

  const { data, loading, error } = useResource('/api/products', { search, filter });

  return (
    <>
      <AppBar back="/" title="Produits" />

      <main className="page">
        <SearchField value={search} onChange={setSearch} placeholder="Rechercher un produit…" />
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={5} height={68} /> : null}

        {data ? (
          <Card>
            {data.length === 0 ? (
              <Empty
                icon={<Package size={26} className="muted" />}
                title="Aucun produit"
                hint={
                  filter === 'all'
                    ? 'Créez votre première fiche produit pour commencer à vendre.'
                    : 'Aucun article ne correspond à ce filtre.'
                }
              />
            ) : (
              <div className="list">
                {data.map((product) => (
                  <Link key={product.id} href={`/products/${product.id}`} className="list__row">
                    <span className="thumb">
                      <Package size={20} />
                    </span>
                    <div className="list__body">
                      <div className="list__title">{product.name}</div>
                      <div className="list__sub">
                        {product.sku ? `${product.sku} · ` : ''}
                        Stock : {quantity(product.stock_quantity)} {product.base_unit}
                      </div>
                      {/* Le badge d'alerte partage la dernière ligne plutôt que la
                          colonne de droite : en colonne, il rétrécissait le texte
                          au point de le faire passer à la ligne. */}
                      <div className="list__sub row" style={{ gap: 8 }}>
                        <span>Prix vente : {money(product.selling_price, currency)}</span>
                        {product.stock_quantity <= 0 ? (
                          <Badge tone="red">Rupture</Badge>
                        ) : product.low_stock_threshold > 0 &&
                          product.stock_quantity <= product.low_stock_threshold ? (
                          <Badge tone="amber">Stock bas</Badge>
                        ) : null}
                      </div>
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
        <Link href="/products/new" className="fab" aria-label="Nouveau produit">
          <Plus size={26} />
        </Link>
      ) : null}
    </>
  );
}

export default function ProductsPage() {
  // useSearchParams suspend au premier rendu : la limite est posée ici pour que
  // le reste de la page ne disparaisse pas pendant la lecture de l'URL.
  return (
    <Suspense fallback={<Skeleton count={5} height={68} />}>
      <ProductsView />
    </Suspense>
  );
}
