'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, MessageCircle } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Button,
  Card,
  Empty,
  Notice,
  SearchField,
  SelectField,
  Sheet,
  Skeleton,
  TextAreaField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { orderTotal } from '@/domain/purchase';
import { unitsOf } from '@/domain/units';
import { money, quantity as fmtQuantity } from '@/utils/format';

/**
 * Nouvelle commande fournisseur (maquette 7, §20).
 *
 * Enregistrer cette commande n'écrit aucun mouvement de stock : commander n'est
 * pas posséder (§21). Le stock ne bougera qu'à la réception, à hauteur de ce qui
 * aura réellement été livré.
 */
export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { currency } = useSession();
  const products = useResource('/api/products');
  const suppliers = useResource('/api/suppliers');

  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const catalog = useMemo(
    () => new Map((products.data || []).map((product) => [product.id, product])),
    [products.data]
  );

  const total = useMemo(
    () => orderTotal(items.map((item) => ({ quantity: item.quantity, unitCost: item.unitCost }))),
    [items]
  );

  function addProduct(product) {
    const units = unitsOf(product, product.units);
    setItems((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        unitId: units[0].id,
        quantity: 1,
        unitCost: product.purchase_price || '',
      },
    ]);
    setPicking(false);
  }

  const patch = (key, values) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...values } : item))
    );

  function shareDraft() {
    const supplier = (suppliers.data || []).find((row) => row.id === supplierId);
    const text = [
      'Projet de commande',
      'Fournisseur : ' + (supplier?.name || ''),
      ...items.map((item) => {
        const product = catalog.get(item.productId);
        const unit = unitsOf(product, product?.units).find((row) => row.id === item.unitId);
        return (
          '• ' +
          product?.name +
          ' — ' +
          fmtQuantity(item.quantity) +
          ' ' +
          (unit?.label || product?.base_unit)
        );
      }),
      'Total estimé : ' + money(total, currency),
      notes,
    ]
      .filter(Boolean)
      .join('\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const order = await api.post('/api/purchase-orders', {
        supplierId: supplierId || null,
        notes,
        items: items.map(({ productId, unitId, quantity, unitCost }) => ({
          productId,
          unitId,
          quantity,
          unitCost,
        })),
      });
      router.replace(`/purchases/${order.id}`);
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar back="/purchases" title="Nouvelle commande" />

      <main className="page page--purchase">
        {error ? <Notice tone="error">{error}</Notice> : null}

        <SelectField
          label="Fournisseur"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">— Choisir un fournisseur —</option>
          {(suppliers.data || []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>

        <h2 className="section-title">Produits</h2>
        <Card>
          {items.length === 0 ? (
            <Empty
              icon={<Search size={26} className="muted" />}
              title="Aucun produit"
              hint="Ajoutez les articles à commander chez ce fournisseur."
            />
          ) : (
            <ul className="purchase-items">
              {items.map((item) => {
                const product = catalog.get(item.productId);
                const units = unitsOf(product, product?.units);
                return (
                  <li key={item.key} className="purchase-item">
                    <div className="purchase-item__row">
                      <span>{product?.name}</span>
                      <input
                        className="input num"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={item.quantity}
                        aria-label={'Quantité — ' + product?.name}
                        onChange={(event) => patch(item.key, { quantity: event.target.value })}
                      />
                      <button
                        type="button"
                        aria-label={'Retirer ' + product?.name}
                        onClick={() =>
                          setItems((current) => current.filter((row) => row.key !== item.key))
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <details>
                      <summary>
                        {money(item.unitCost || 0, currency)} /{' '}
                        {units.find((unit) => unit.id === item.unitId)?.label || product?.base_unit}{' '}
                        · Modifier le coût
                      </summary>
                      <div className="grid-2">
                        <SelectField
                          label="Conditionnement"
                          value={item.unitId}
                          onChange={(event) => {
                            const unit = units.find((unit) => unit.id === event.target.value);
                            patch(item.key, {
                              unitId: event.target.value,
                              unitCost: (product?.purchase_price || 0) * (unit?.factor || 1),
                            });
                          }}
                        >
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.label} ({fmtQuantity(unit.factor)} {product?.base_unit})
                            </option>
                          ))}
                        </SelectField>
                        <label className="field">
                          <span className="field__label">Coût unitaire</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitCost}
                            onChange={(event) => patch(item.key, { unitCost: event.target.value })}
                          />
                        </label>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <button
          type="button"
          className="btn btn--dashed btn--block"
          onClick={() => setPicking(true)}
        >
          <Plus size={18} />
          Ajouter un produit
        </button>

        <TextAreaField
          label="Notes (optionnel)"
          rows={2}
          placeholder="Livraison prévue la semaine prochaine."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <Card pad>
          <div className="total-line total-line--grand" style={{ marginTop: 0, borderTop: 'none' }}>
            <span>Total estimé</span>
            <span className="num amount">{money(total, currency)}</span>
          </div>
        </Card>

        <Button block disabled={items.length === 0 || !supplierId || busy} onClick={submit}>
          {busy ? 'Enregistrement…' : 'Générer la commande'}
        </Button>
        <Button block variant="soft" disabled={!items.length || !supplierId} onClick={shareDraft}>
          <MessageCircle size={21} style={{ color: 'var(--green)' }} />
          Partager sur WhatsApp
        </Button>
      </main>

      <Sheet open={picking} title="Ajouter un produit" onClose={() => setPicking(false)}>
        <PickerBody
          products={products.data}
          loading={products.loading}
          currency={currency}
          onPick={addProduct}
        />
      </Sheet>
    </>
  );
}

function PickerBody({ products, loading, currency, onPick }) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = products || [];
    if (!term) return all.slice(0, 40);
    return all.filter((product) => product.name.toLowerCase().includes(term)).slice(0, 40);
  }, [products, search]);

  return (
    <>
      <SearchField value={search} onChange={setSearch} placeholder="Nom du produit…" />
      {loading ? <Skeleton count={4} height={56} /> : null}
      {!loading && results.length === 0 ? (
        <Empty
          title="Aucun produit"
          hint="Créez d'abord la fiche produit : c'est elle qui recevra le stock à la livraison."
        />
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
              <div className="list__sub">
                Stock : {fmtQuantity(product.stock_quantity)} {product.base_unit}
              </div>
            </div>
            <span className="small muted num">{money(product.purchase_price, currency)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
