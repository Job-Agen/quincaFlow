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
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { buildSaleLine, totalsOf, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/domain/sale';
import { maxSellable, unitsOf } from '@/domain/units';
import { money, quantity as fmtQuantity } from '@/utils/format';

/**
 * Vente rapide (maquette 3, §11).
 *
 * C'est l'écran le plus utilisé de QuincaFlow, et le seul dont la lenteur se
 * verrait immédiatement au comptoir. Le catalogue est donc chargé une fois puis
 * filtré en mémoire : chercher « vis » ne déclenche aucun aller-retour réseau.
 *
 * Les totaux affichés sont calculés par les mêmes fonctions que celles utilisées
 * côté serveur à la validation. L'affichage est instantané, mais le montant qui
 * fait foi reste celui que le serveur recalcule avant d'écrire (§35).
 */
export default function NewSalePage() {
  const router = useRouter();
  const { currency } = useSession();
  const products = useResource('/api/products');
  const customers = useResource('/api/customers');

  const [lines, setLines] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [picking, setPicking] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Chaque produit est indexé avec ses conditionnements : la ligne de panier ne
  // stocke que des identifiants, tout le reste est dérivé du catalogue.
  const catalog = useMemo(() => {
    const map = new Map();
    (products.data || []).forEach((product) => {
      map.set(product.id, { product, units: unitsOf(product, product.units) });
    });
    return map;
  }, [products.data]);

  const priced = useMemo(
    () =>
      lines
        .map((line) => {
          const found = catalog.get(line.productId);
          if (!found) return null;
          return { key: line.key, ...buildSaleLine(line, found.product, found.units), entry: line };
        })
        .filter(Boolean),
    [lines, catalog]
  );

  const totals = useMemo(() => totalsOf(priced, discount || 0), [priced, discount]);

  function addProduct(product) {
    const units = unitsOf(product, product.units);
    const unit = units[0];
    setLines((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        unitId: unit.id,
        quantity: 1,
        unitPrice: '',
      },
    ]);
    setPicking(false);
  }

  const patchLine = (key, patch) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const removeLine = (key) => setLines((current) => current.filter((line) => line.key !== key));

  async function validate(payment) {
    setBusy(true);
    setError(null);
    try {
      const sale = await api.post('/api/sales', {
        customerId: customerId || null,
        discount: Number(discount) || 0,
        lines: lines.map(({ productId, unitId, quantity, unitPrice }) => ({
          productId,
          unitId,
          quantity,
          unitPrice: unitPrice === '' ? null : unitPrice,
        })),
        ...payment,
      });
      router.replace(`/sales/${sale.id}`);
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
      setCheckout(false);
    }
  }

  return (
    <>
      <AppBar back="/" title="Nouvelle vente" />

      <main className="page">
        {error ? <Notice tone="error">{error}</Notice> : null}

        <SelectField
          label="Client (optionnel)"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">Client comptoir</option>
          {(customers.data || []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </SelectField>

        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => setPicking(true)}
        >
          <Search size={18} />
          Rechercher un produit…
        </button>

        <Card>
          {priced.length === 0 ? (
            <Empty
              icon={<Search size={26} className="muted" />}
              title="Panier vide"
              hint="Ajoutez les articles demandés par le client."
            />
          ) : (
            <ul className="cart">
              {priced.map((line) => {
                const found = catalog.get(line.productId);
                const units = found.units;
                const available = maxSellable(
                  units.find((unit) => unit.id === line.entry.unitId) || units[0],
                  found.product.stock_quantity
                );
                return (
                  <li className="cart__item" key={line.key}>
                    <div className="cart__head">
                      <span className="strong">{line.productName}</span>
                      <button
                        type="button"
                        className="appbar__icon"
                        style={{ color: 'var(--red)' }}
                        aria-label={`Retirer ${line.productName}`}
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {units.length > 1 ? (
                      <select
                        className="input"
                        style={{ minHeight: 40, fontSize: 14 }}
                        value={line.entry.unitId}
                        onChange={(event) => patchLine(line.key, { unitId: event.target.value })}
                        aria-label="Conditionnement"
                      >
                        {units.map((unit) => (
                          // L'unité de base ne gagne rien à être suivie de
                          // « (1 sac) » : le rappel du contenu n'a de sens que
                          // pour les conditionnements qui en regroupent plusieurs.
                          <option key={unit.id} value={unit.id}>
                            {unit.factor === 1
                              ? unit.label
                              : `${unit.label} (${fmtQuantity(unit.factor)} ${found.product.base_unit})`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="small muted">{line.unitLabel}</div>
                    )}

                    <div className="cart__calc">
                      <input
                        className="input num"
                        style={{ minHeight: 40, textAlign: 'right' }}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={line.entry.quantity}
                        aria-label={`Quantité — ${line.productName}`}
                        onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                      />
                      <span className="muted">×</span>
                      <input
                        className="input num"
                        style={{ minHeight: 40, textAlign: 'right' }}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={line.entry.unitPrice === '' ? line.unitPrice : line.entry.unitPrice}
                        aria-label={`Prix unitaire — ${line.productName}`}
                        onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                      />
                      <span className="num strong cart__total">
                        {line.lineTotal.toLocaleString('fr-FR')}
                      </span>
                    </div>

                    {line.entry.quantity > available ? (
                      <div className="small" style={{ color: 'var(--red)' }}>
                        Stock disponible : {available}
                      </div>
                    ) : null}
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

        <Card pad>
          <div className="total-line">
            <span className="muted">Sous-total</span>
            <span className="num strong">{money(totals.subtotal, currency)}</span>
          </div>
          <div className="total-line">
            <span className="muted">Remise</span>
            <input
              className="input num"
              style={{ width: 120, minHeight: 40, textAlign: 'right' }}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              aria-label="Remise"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
          <div className="total-line total-line--grand">
            <span>TOTAL</span>
            <span className="num amount">{money(totals.total, currency)}</span>
          </div>
        </Card>

        <Button
          variant="success"
          block
          disabled={priced.length === 0 || busy}
          onClick={() => setCheckout(true)}
        >
          Valider la vente
        </Button>
      </main>

      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        products={products.data}
        loading={products.loading}
        currency={currency}
        onPick={addProduct}
      />

      <CheckoutSheet
        open={checkout}
        onClose={() => setCheckout(false)}
        total={totals.total}
        currency={currency}
        busy={busy}
        onConfirm={validate}
      />
    </>
  );
}

/** Sélecteur de produit : recherche instantanée sur le catalogue déjà chargé. */
function ProductPicker({ open, onClose, products, loading, currency, onPick }) {
  const [search, setSearch] = useState('');

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = products || [];
    if (!term) return all.slice(0, 40);
    return all
      .filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          (product.sku || '').toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [products, search]);

  return (
    <Sheet open={open} title="Ajouter un produit" onClose={onClose}>
      <SearchField value={search} onChange={setSearch} placeholder="Nom ou référence…" />
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
              <div className="list__sub">
                {product.sku ? `${product.sku} · ` : ''}
                Stock : {fmtQuantity(product.stock_quantity)} {product.base_unit}
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

/**
 * Encaissement.
 *
 * Le montant reçu est saisi séparément du total afin d'afficher la monnaie à
 * rendre — c'est le calcul que le vendeur faisait jusqu'ici à la calculatrice.
 * Laisser le champ vide vaut « réglé intégralement », le cas courant.
 */
function CheckoutSheet({ open, onClose, total, currency, busy, onConfirm }) {
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');

  const change = received === '' ? null : Number(received) - total;

  return (
    <Sheet open={open} title="Encaissement" onClose={onClose}>
      <div className="total-line total-line--grand" style={{ marginTop: 0 }}>
        <span>À payer</span>
        <span className="num amount">{money(total, currency)}</span>
      </div>

      <div className="field">
        <span className="field__label">Mode de paiement</span>
        <div className="segmented">
          {PAYMENT_METHODS.map((value) => (
            <button
              key={value}
              type="button"
              className="segmented__item"
              data-active={value === method}
              onClick={() => setMethod(value)}
            >
              {PAYMENT_METHOD_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <TextField
        label="Montant reçu (optionnel)"
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        placeholder={String(total)}
        value={received}
        onChange={(event) => setReceived(event.target.value)}
        hint={
          change === null
            ? 'Laissez vide si le client règle le montant exact.'
            : change >= 0
              ? `Monnaie à rendre : ${money(change, currency)}`
              : `Reste dû : ${money(-change, currency)}`
        }
      />

      <Button
        variant="success"
        block
        disabled={busy}
        onClick={() =>
          onConfirm({
            paymentMethod: method,
            amountPaid: received === '' ? null : Math.min(Number(received), total),
          })
        }
      >
        {busy ? 'Enregistrement…' : 'Encaisser et enregistrer'}
      </Button>
    </Sheet>
  );
}
