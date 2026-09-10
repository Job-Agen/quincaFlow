'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ClipboardList, Package, Pencil, SlidersHorizontal } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import ProductForm from '@/components/products/ProductForm';
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Notice,
  SelectField,
  Sheet,
  Skeleton,
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { ADJUSTMENT_REASONS, MOVEMENT_LABELS } from '@/domain/stock';
import { describeStock } from '@/domain/units';
import { dateTime, money, quantity } from '@/utils/format';

/**
 * Fiche produit : état du stock, conditionnements, et journal des mouvements.
 *
 * Le journal est affiché ici plutôt que dans un écran séparé parce que c'est la
 * question qu'on se pose devant l'article : pourquoi le stock affiché n'est-il
 * pas celui du rayon ? (§26)
 */
export default function ProductPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { currency, isOwner } = useSession();
  const product = useResource(`/api/products/${id}`);
  const movements = useResource(`/api/products/${id}/movements`);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const data = product.data;

  async function refresh(updated) {
    product.setData(updated);
    movements.reload();
  }

  return (
    <>
      <AppBar
        back="/products"
        title={data?.name || 'Produit'}
        right={
          data ? (
            <button
              type="button"
              className="appbar__icon"
              aria-label="Modifier"
              onClick={() => setEditing(true)}
            >
              <Pencil size={19} />
            </button>
          ) : null
        }
      />

      <main className="page">
        {product.error ? <Notice tone="error">{product.error.message}</Notice> : null}
        {product.loading && !data ? <Skeleton count={3} height={100} /> : null}

        {data ? (
          <>
            <Card pad className="stack">
              <div className="row row--between">
                <div className="row">
                  <span className="thumb">
                    <Package size={20} />
                  </span>
                  <div>
                    <div className="strong">{data.name}</div>
                    <div className="small muted">{data.sku || 'Sans référence'}</div>
                  </div>
                </div>
                {data.stock_quantity <= 0 ? (
                  <Badge tone="red">Rupture</Badge>
                ) : data.low_stock_threshold > 0 &&
                  data.stock_quantity <= data.low_stock_threshold ? (
                  <Badge tone="amber">Stock bas</Badge>
                ) : (
                  <Badge tone="green">En stock</Badge>
                )}
              </div>

              <div className="tiles">
                <div className="tile tile--blue">
                  <span className="tile__label">Stock</span>
                  <span className="tile__value num">{quantity(data.stock_quantity)}</span>
                  <span className="tile__unit">{data.base_unit}</span>
                </div>
                <div className="tile tile--green">
                  <span className="tile__label">Prix de vente</span>
                  <span className="tile__value num">
                    {Number(data.selling_price).toLocaleString('fr-FR')}
                  </span>
                  <span className="tile__unit">{currency}</span>
                </div>
              </div>

              {data.units.length > 1 ? (
                <p className="small muted">
                  {describeStock(data.stock_quantity, data.units, data.base_unit)}
                </p>
              ) : null}

              <div className="grid-2">
                <Button variant="soft" onClick={() => setAdjusting(true)}>
                  <SlidersHorizontal size={17} />
                  Ajuster le stock
                </Button>
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil size={17} />
                  Modifier
                </Button>
              </div>
            </Card>

            {data.units.length > 1 ? (
              <Card>
                <CardHead title="Conditionnements" />
                <div className="table-wrap">
                  <table className="table" style={{ padding: '0 8px' }}>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 16 }}>Unité</th>
                        <th className="num">Contient</th>
                        <th className="num" style={{ paddingRight: 16 }}>
                          Prix
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.units.map((unit) => (
                        <tr key={unit.id}>
                          <td style={{ paddingLeft: 16 }}>{unit.label}</td>
                          <td className="num">
                            {quantity(unit.factor)} {data.base_unit}
                          </td>
                          <td className="num" style={{ paddingRight: 16 }}>
                            {money(unit.price, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            <Card>
              <CardHead title="Mouvements de stock" />
              {movements.loading && !movements.data ? (
                <div style={{ padding: 16 }}>
                  <Skeleton count={3} height={44} />
                </div>
              ) : null}
              {movements.data?.length === 0 ? (
                <Empty
                  icon={<ClipboardList size={24} className="muted" />}
                  title="Aucun mouvement"
                  hint="Les ventes et réceptions apparaîtront ici."
                />
              ) : null}
              <div className="list">
                {(movements.data || []).map((movement) => (
                  <div key={movement.id} className="list__row">
                    <div className="list__body">
                      <div className="list__title">{MOVEMENT_LABELS[movement.type]}</div>
                      <div className="list__sub">
                        {dateTime(movement.created_at)}
                        {movement.note ? ` · ${movement.note}` : ''}
                      </div>
                    </div>
                    <div className="list__end">
                      <strong
                        className="num"
                        style={{
                          color: movement.quantity < 0 ? 'var(--red)' : 'var(--green-dark)',
                        }}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {quantity(movement.quantity)}
                      </strong>
                      <span className="small muted num">
                        reste {quantity(movement.stock_after)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {isOwner ? (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                style={{ color: 'var(--red)' }}
                onClick={async () => {
                  await api.delete(`/api/products/${id}`);
                  router.replace('/products');
                }}
              >
                <Archive size={17} />
                Archiver ce produit
              </button>
            ) : null}

            <Sheet open={editing} title="Modifier le produit" onClose={() => setEditing(false)}>
              <ProductForm
                initial={data}
                currency={currency}
                submitLabel="Enregistrer"
                onSubmit={async (body) => {
                  await refresh(await api.patch(`/api/products/${id}`, body));
                  setEditing(false);
                }}
              />
            </Sheet>

            <AdjustSheet
              open={adjusting}
              product={data}
              onClose={() => setAdjusting(false)}
              onConfirm={async (body) => {
                await refresh(await api.post(`/api/products/${id}/adjust`, body));
                setAdjusting(false);
              }}
            />
          </>
        ) : null}
      </main>
    </>
  );
}

/**
 * Ajustement d'inventaire.
 *
 * Le gérant saisit ce qu'il a réellement compté en rayon, pas l'écart : compter
 * est une opération concrète, calculer une différence de tête ne l'est pas.
 */
function AdjustSheet({ open, product, onClose, onConfirm }) {
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState(ADJUSTMENT_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const delta = counted === '' ? null : Number(counted) - product.stock_quantity;

  return (
    <Sheet open={open} title="Ajuster le stock" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p className="small muted">
        Stock enregistré : {quantity(product.stock_quantity)} {product.base_unit}
      </p>
      <TextField
        label={`Stock réellement compté (${product.base_unit})`}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={counted}
        onChange={(event) => setCounted(event.target.value)}
        hint={
          delta === null || delta === 0
            ? undefined
            : `Écart : ${delta > 0 ? '+' : ''}${quantity(delta)}`
        }
      />
      <SelectField label="Motif" value={reason} onChange={(event) => setReason(event.target.value)}>
        {ADJUSTMENT_REASONS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </SelectField>
      <Button
        block
        disabled={busy || counted === '' || delta === 0}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onConfirm({ stockQuantity: Number(counted), reason });
          } catch (issue) {
            setError(issue.message);
          }
          setBusy(false);
        }}
      >
        {busy ? 'Enregistrement…' : "Enregistrer l'ajustement"}
      </Button>
    </Sheet>
  );
}
