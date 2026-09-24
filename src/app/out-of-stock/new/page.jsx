'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Info } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Button,
  Card,
  Notice,
  SelectField,
  Skeleton,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { marginOf } from '@/domain/outOfStock';
import { money } from '@/utils/format';

/**
 * Vente hors stock (maquette 6, §16).
 *
 * Un logiciel qui répond « stock = 0, vente impossible » ne décrit pas ce que
 * fait réellement une quincaillerie : elle va chercher la pièce chez un confrère
 * et prend sa marge au passage. Cet écran enregistre cette opération telle
 * qu'elle se déroule, sans la faire passer par le stock.
 */
function NewOutOfStockView() {
  const router = useRouter();
  const params = useSearchParams();
  const { currency } = useSession();
  const products = useResource('/api/products');
  const customers = useResource('/api/customers');

  const [form, setForm] = useState({
    productId: params.get('productId') || '',
    productName: '',
    customerId: '',
    otherSeller: '',
    quantity: 1,
    costPrice: '',
    sellingPrice: '',
    note: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const margin = useMemo(
    () =>
      marginOf({
        quantity: form.quantity,
        costPrice: form.costPrice,
        sellingPrice: form.sellingPrice,
      }),
    [form.quantity, form.costPrice, form.sellingPrice]
  );

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post('/api/out-of-stock-sales', {
        ...form,
        productId: form.productId || null,
        customerId: form.customerId || null,
      });
      router.replace(`/out-of-stock/${created.id}`);
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar back="/out-of-stock" title="Vente hors stock" />

      <main className="page page--oos">
        <form className="stack" onSubmit={submit}>
          <Notice icon={<Info size={18} style={{ flexShrink: 0 }} />}>
            Produit non disponible en stock, mais que vous pouvez obtenir chez un autre vendeur.
          </Notice>

          {error ? <Notice tone="error">{error}</Notice> : null}

          <Card pad className="stack">
            <SelectField
              label="Produit"
              hint="Laissez vide si l'article n'existe pas encore chez vous."
              value={form.productId}
              onChange={set('productId')}
            >
              <option value="">— Produit hors catalogue —</option>
              {(products.data || []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </SelectField>

            {form.productId ? null : (
              <TextField
                label="Produit demandé"
                placeholder="Disqueuse 900 W"
                value={form.productName}
                onChange={set('productName')}
                required
              />
            )}

            <TextField
              label="Autre vendeur"
              placeholder="Quincaillerie Centrale"
              value={form.otherSeller}
              onChange={set('otherSeller')}
            />
          </Card>

          <Card pad className="stack">
            <div className="grid-2">
              <TextField
                label={`Coût d'achat (${currency})`}
                hint="Ce que vous payez au confrère, par unité."
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.costPrice}
                onChange={set('costPrice')}
                required
              />
              <TextField
                label={`Prix de vente client (${currency})`}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.sellingPrice}
                onChange={set('sellingPrice')}
                required
              />
            </div>

            <div
              className="total-line"
              style={{
                background: margin >= 0 ? 'var(--green-soft)' : 'var(--red-soft)',
                borderRadius: 'var(--r)',
                padding: '12px 14px',
              }}
            >
              <strong>Marge brute</strong>
              <strong
                className="num"
                style={{ color: margin >= 0 ? 'var(--green-dark)' : 'var(--red)' }}
              >
                {money(margin, currency)}
              </strong>
            </div>

            <details className="additional-details">
              <summary>Client, quantité et note</summary>
              <div className="stack">
                {' '}
                <SelectField label="Client" value={form.customerId} onChange={set('customerId')}>
                  <option value="">Client comptoir</option>
                  {(customers.data || []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </SelectField>{' '}
                <TextField
                  label="Quantité"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={set('quantity')}
                  required
                />
                <TextAreaField
                  label="Note (optionnelle)"
                  rows={2}
                  value={form.note}
                  onChange={set('note')}
                />
              </div>
            </details>
          </Card>

          <Button block type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </main>
    </>
  );
}

export default function NewOutOfStockPage() {
  return (
    <Suspense fallback={<Skeleton count={4} height={80} />}>
      <NewOutOfStockView />
    </Suspense>
  );
}
