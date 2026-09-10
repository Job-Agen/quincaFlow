'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHead, Notice, TextAreaField, TextField } from '@/components/ui';
import { costPerBaseUnit, pricePerBaseUnit } from '@/domain/units';
import { money } from '@/utils/format';

/**
 * Fiche produit — création et modification.
 *
 * Les conditionnements sont saisis ici (§10). Chacun déclare combien d'unités de
 * base il contient et à quel prix il se vend entier ; l'aide affichée sous la
 * ligne ramène ce prix à l'unité, seule grandeur qui permette de vérifier d'un
 * coup d'œil qu'un carton n'est pas vendu plus cher que les pièces qu'il contient.
 */
export default function ProductForm({ initial, onSubmit, submitLabel, currency }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    sku: initial?.sku || '',
    description: initial?.description || '',
    baseUnit: initial?.base_unit || 'pièce',
    purchasePrice: initial?.purchase_price ?? '',
    sellingPrice: initial?.selling_price ?? '',
    lowStockThreshold: initial?.low_stock_threshold ?? '',
    stockQuantity: initial ? undefined : '',
    units: (initial?.units || [])
      .filter((unit) => unit.factor !== 1)
      .map((unit) => ({ label: unit.label, factor: unit.factor, price: unit.price })),
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const patchUnit = (index, patch) =>
    setForm({
      ...form,
      units: form.units.map((unit, position) =>
        position === index ? { ...unit, ...patch } : unit
      ),
    });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        units: form.units.filter((unit) => unit.label && Number(unit.factor) > 0),
      });
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card pad className="stack">
        <TextField
          label="Nom du produit"
          placeholder="Ciment 50 kg"
          value={form.name}
          onChange={set('name')}
          required
        />
        <div className="grid-2">
          <TextField
            label="Référence"
            placeholder="SAC-CIM-001"
            value={form.sku}
            onChange={set('sku')}
          />
          <TextField
            label="Unité de base"
            placeholder="pièce, sac, mètre…"
            hint="L'unité dans laquelle le stock est compté."
            value={form.baseUnit}
            onChange={set('baseUnit')}
            required
          />
        </div>
        <TextAreaField
          label="Description (optionnelle)"
          value={form.description}
          onChange={set('description')}
          rows={2}
        />
      </Card>

      <Card pad className="stack">
        <div className="grid-2">
          <TextField
            label={`Prix d'achat (${currency})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            hint="Par unité de base."
            value={form.purchasePrice}
            onChange={set('purchasePrice')}
          />
          <TextField
            label={`Prix de vente (${currency})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={form.sellingPrice}
            onChange={set('sellingPrice')}
            required
          />
        </div>
        <div className="grid-2">
          <TextField
            label="Seuil d'alerte"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            hint="0 = pas d'alerte."
            value={form.lowStockThreshold}
            onChange={set('lowStockThreshold')}
          />
          {form.stockQuantity !== undefined ? (
            <TextField
              label="Stock initial"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              hint="Enregistré comme ajustement d'inventaire."
              value={form.stockQuantity}
              onChange={set('stockQuantity')}
            />
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Conditionnements"
          action={
            <button
              type="button"
              className="btn btn--soft btn--sm"
              onClick={() =>
                setForm({ ...form, units: [...form.units, { label: '', factor: '', price: '' }] })
              }
            >
              <Plus size={15} />
              Ajouter
            </button>
          }
        />
        <div className="stack" style={{ padding: 16 }}>
          <p className="small muted">
            Le stock reste compté en {form.baseUnit || 'unité de base'}. Vendre 1 carton de 40 en
            retire 40 — inutile de tenir un second stock.
          </p>

          {form.units.length === 0 ? (
            <p className="small muted">Aucun conditionnement : le produit se vend à l&apos;unité.</p>
          ) : null}

          {form.units.map((unit, index) => {
            const perUnit = pricePerBaseUnit({ factor: Number(unit.factor), price: Number(unit.price) });
            const cost = costPerBaseUnit(form.purchasePrice, { factor: 1 });
            return (
              <div key={index} className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <TextField
                    label="Libellé"
                    placeholder="carton"
                    value={unit.label}
                    onChange={(event) => patchUnit(index, { label: event.target.value })}
                  />
                  <TextField
                    label={`En ${form.baseUnit || 'unités'}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="40"
                    value={unit.factor}
                    onChange={(event) => patchUnit(index, { factor: event.target.value })}
                  />
                  <TextField
                    label="Prix du lot"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={unit.price}
                    onChange={(event) => patchUnit(index, { price: event.target.value })}
                  />
                  <button
                    type="button"
                    className="appbar__icon"
                    style={{ color: 'var(--red)', marginBottom: 4 }}
                    aria-label="Retirer ce conditionnement"
                    onClick={() =>
                      setForm({ ...form, units: form.units.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                {perUnit > 0 ? (
                  <p className="small muted">
                    Revient à {money(perUnit, currency)} l&apos;{form.baseUnit || 'unité'}
                    {cost > 0 && perUnit < cost ? (
                      <span style={{ color: 'var(--red)' }}> — en dessous du prix d&apos;achat</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Button block type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : submitLabel}
      </Button>
    </form>
  );
}
