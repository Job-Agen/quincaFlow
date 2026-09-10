'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2 } from 'lucide-react';
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

      <main className="page">
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

        <Card>
          {items.length === 0 ? (
            <Empty
              icon={<Search size={26} className="muted" />}
              title="Aucun produit"
              hint="Ajoutez les articles à commander chez ce fournisseur."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>Produit</th>
                    <th className="num">Qté</th>
                    <th className="num">Coût unitaire</th>
                    <th aria-label="Retirer" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const product = catalog.get(item.productId);
                    const units = unitsOf(product, product?.units);
                    return (
                      <tr key={item.key}>
                        <td style={{ paddingLeft: 16 }}>
                          <div className="strong">{product?.name}</div>
                          {units.length > 1 ? (
                            <select
                              className="input"
                              style={{ minHeight: 34, fontSize: 13, marginTop: 4 }}
                              value={item.unitId}
                              aria-label="Conditionnement commandé"
                              onChange={(event) => patch(item.key, { unitId: event.target.value })}
                            >
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.label} ({fmtQuantity(unit.factor)} {product.base_unit})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="small muted">{product?.base_unit}</div>
                          )}
                        </td>
                        <td>
                          <input
                            className="input num"
                            style={{ width: 72, minHeight: 40, textAlign: 'right' }}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={item.quantity}
                            aria-label={`Quantité — ${product?.name}`}
                            onChange={(event) => patch(item.key, { quantity: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="input num"
                            style={{ width: 96, minHeight: 40, textAlign: 'right' }}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={item.unitCost}
                            aria-label={`Coût unitaire — ${product?.name}`}
                            onChange={(event) => patch(item.key, { unitCost: event.target.value })}
                          />
                        </td>
                        <td style={{ paddingRight: 8 }}>
                          <button
                            type="button"
                            className="appbar__icon"
                            style={{ color: 'var(--red)' }}
                            aria-label={`Retirer ${product?.name}`}
                            onClick={() =>
                              setItems((current) => current.filter((row) => row.key !== item.key))
                            }
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

        <Notice>
          Cette commande ne modifie pas votre stock. Il augmentera à la réception, pour les
          quantités réellement livrées.
        </Notice>

        <Button block disabled={items.length === 0 || !supplierId || busy} onClick={submit}>
          {busy ? 'Enregistrement…' : 'Générer la commande'}
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
