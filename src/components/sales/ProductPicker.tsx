'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Empty, SearchField, Segmented, Sheet, Skeleton } from '@/components/ui';
import { describeStock } from '@/domain/units';
import { money } from '@/utils/format';
import type { Product } from '@/types';

/** Sélecteur de produit : recherche instantanée sur le catalogue déjà chargé. */
export default function ProductPicker({
  open,
  onClose,
  products,
  loading,
  currency,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[] | null;
  loading: boolean;
  currency: string;
  onPick: (product: Product) => void;
}) {
  const [search, setSearch] = useState('');
  const [rayon, setRayon] = useState('');

  // Les rayons se déduisent du catalogue déjà chargé : au comptoir, filtrer ne
  // doit pas attendre le réseau. Les plus fournis d'abord — c'est là que le
  // vendeur cherche le plus souvent (§52).
  const rayons = useMemo(() => {
    const compte = new Map<string, number>();
    (products || []).forEach((product) => {
      const nom = (product.category || '').trim();
      if (nom) compte.set(nom, (compte.get(nom) ?? 0) + 1);
    });
    return [...compte.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
      .map(([value]) => ({ value, label: value }));
  }, [products]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = (products || []).filter(
      (product) => !rayon || (product.category || '').trim() === rayon
    );
    if (!term) return all.slice(0, 40);
    return all
      .filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          (product.sku || '').toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [products, rayon, search]);

  return (
    <Sheet open={open} title="Ajouter un produit" onClose={onClose}>
      <SearchField value={search} onChange={setSearch} placeholder="Nom ou référence…" />
      {/* Un seul rayon ne se filtre pas : la rangée n'apparaît qu'à partir de
        deux, sinon elle occupe la place sans rien offrir. */}
      {rayons.length > 1 ? (
        <Segmented
          wrap
          options={[{ value: '', label: 'Tous' }, ...rayons]}
          value={rayon}
          onChange={setRayon}
        />
      ) : null}
      {loading ? <Skeleton count={4} height={56} /> : null}
      {!loading && results.length === 0 ? (
        <Empty title="Aucun produit" hint="Vérifiez l'orthographe ou créez la fiche produit." />
      ) : null}
      <div className="list">
        {results.map((product) => (
          <button
            key={product.id}
            type="button"
            className="list__row"
            onClick={() => onPick(product)}
          >
            <div className="list__body">
              <div className="list__title">{product.name}</div>
              {/* Le vendeur choisit dans la même lecture que celle du rayon :
                pièces et lots (§10), comme sur le téléphone. */}
              <div className="list__sub">
                {product.sku ? `${product.sku} · ` : ''}
                Stock : {describeStock(product.stock_quantity, product.units, product.base_unit)}
              </div>
            </div>
            <div className="list__end">
              <strong className="num">{money(product.selling_price, currency)}</strong>
              {product.stock_quantity <= 0 ? (
                <span className="badge badge--red">Rupture</span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
