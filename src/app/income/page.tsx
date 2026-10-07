'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Button,
  Card,
  CardHead,
  Empty,
  Notice,
  Segmented,
  Sheet,
  Skeleton,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { INCOME_CATEGORIES, INCOME_CATEGORY_LABELS, isRevenue } from '@/domain/income';
import { errorMessage } from '@/utils/errors';
import { money, shortDate } from '@/utils/format';
import type { IncomeCategory, IncomeRow, TakingsBook } from '@/types';

/**
 * Cahier de recettes (§42).
 *
 * C'est le cahier que le gérant tient à la main, et la question qu'il se pose en
 * fermant : « combien ai-je fait aujourd'hui ? » Une moitié se remplit toute
 * seule — chaque encaissement de vente tombe dans sa journée ; l'autre se
 * saisit, pour l'argent qui entre sans passer par une marchandise.
 *
 * Ouvert au vendeur comme au propriétaire, contrairement aux rapports et au
 * journal de caisse : cet écran ne montre que ce qui est entré, jamais une marge
 * ni un coût d'achat. Et l'argent d'une réparation entre au comptoir — interdire
 * au vendeur de l'inscrire le ferait disparaître (§42).
 */

const PERIODS = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last-month', label: 'Mois dernier' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
];

/** Recette en cours de saisie. `isNew` n'existe qu'à l'écran. */
type Editing = Partial<IncomeRow> & { isNew?: boolean };

/** Date du jour au format attendu par un champ `date`. */
function todayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function IncomePage() {
  const { currency } = useSession();
  const [period, setPeriod] = useState('month');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const book = useResource<TakingsBook>('/api/takings', { period });
  const list = useResource<IncomeRow[]>('/api/incomes', { period });

  const cahier = book.data;
  const recettes = list.data || [];

  function refresh() {
    book.reload();
    list.reload();
  }

  async function remove(income: IncomeRow) {
    setError(null);
    try {
      await api.delete(`/api/incomes/${income.id}`);
      setEditing(null);
      refresh();
    } catch (issue) {
      setError(errorMessage(issue));
    }
  }

  return (
    <>
      <AppBar back="/more" title="Cahier de recettes" />

      <main className="page page--fab">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />

        {error ? <Notice tone="error">{error}</Notice> : null}
        {book.error ? <Notice tone="error">{book.error.message}</Notice> : null}
        {book.loading && !cahier ? <Skeleton count={4} height={64} /> : null}

        {cahier ? (
          <>
            <div className="tiles">
              <div className="tile tile--green">
                <span className="tile__label">Total encaissé</span>
                <span className="tile__value num">{money(cahier.total, '').trim()}</span>
                <span className="tile__unit">{currency}</span>
              </div>
              <div className="tile tile--blue">
                <span className="tile__label">Ventes</span>
                <span className="tile__value num">{money(cahier.salesTotal, '').trim()}</span>
                <span className="tile__unit">{currency}</span>
              </div>
            </div>

            {/* La nuance qui évite de compter deux fois la même vente (§42). */}
            {cahier.otherTotal > cahier.otherRevenue ? (
              <Notice>
                {money(cahier.otherTotal - cahier.otherRevenue, currency)} de remboursements de
                dette sont entrés en caisse sans compter dans le chiffre d’affaires : ces ventes ont
                déjà été comptées le jour où elles ont eu lieu.
              </Notice>
            ) : null}

            <Card>
              <CardHead
                title="Jour par jour"
                action={
                  <Link href="/cash" className="link">
                    Journal de caisse
                  </Link>
                }
              />
              {cahier.days.length === 0 ? (
                <Empty
                  icon={<BookOpen size={26} className="muted" />}
                  title="Rien d’encaissé"
                  hint="Les ventes y tombent toutes seules. Ajoutez ici ce qui entre autrement : une réparation, une livraison, une location."
                />
              ) : (
                <div className="list">
                  {cahier.days.map((jour) => (
                    <div key={jour.day} className="list__row">
                      <div className="list__body">
                        <div className="list__title">{shortDate(jour.day)}</div>
                        <div className="list__sub">
                          {jour.salesCount > 0
                            ? `${jour.salesCount} vente${jour.salesCount > 1 ? 's' : ''} · ${money(jour.salesAmount, currency)}`
                            : 'Aucune vente'}
                          {jour.otherCount > 0
                            ? ` · ${jour.otherCount} hors vente · ${money(jour.otherAmount, currency)}`
                            : ''}
                        </div>
                      </div>
                      <strong className="num">{money(jour.total, currency)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}

        <Card>
          <CardHead title="Recettes hors vente" />
          {recettes.length === 0 ? (
            <Empty
              title="Aucune recette saisie"
              hint="Service rendu, livraison, location, remboursement d’une ardoise."
            />
          ) : (
            <div className="list">
              {recettes.map((recette) => (
                <button
                  key={recette.id}
                  type="button"
                  className="list__row"
                  onClick={() => setEditing(recette)}
                >
                  <div className="list__body">
                    <div className="list__title">{recette.label}</div>
                    <div className="list__sub">
                      {INCOME_CATEGORY_LABELS[recette.category]} · {shortDate(recette.received_on)}
                      {isRevenue(recette.category) ? '' : ' · hors chiffre d’affaires'}
                    </div>
                  </div>
                  <strong className="num">{money(recette.amount, currency)}</strong>
                </button>
              ))}
            </div>
          )}
          {cahier && cahier.otherTotal > 0 ? (
            <div className="card--pad">
              <div className="total-line total-line--grand">
                <span>Total hors vente</span>
                <span className="amount num">{money(cahier.otherTotal, currency)}</span>
              </div>
            </div>
          ) : null}
        </Card>
      </main>

      <button
        type="button"
        className="fab"
        aria-label="Nouvelle recette"
        onClick={() => setEditing({ isNew: true, category: 'SERVICE', received_on: todayKey() })}
      >
        <Plus size={24} />
      </button>

      {editing ? (
        <IncomeSheet
          income={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onDelete={remove}
        />
      ) : null}
    </>
  );
}

function IncomeSheet({
  income,
  onClose,
  onSaved,
  onDelete,
}: {
  income: Editing;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (income: IncomeRow) => void;
}) {
  const { currency } = useSession();
  const [form, setForm] = useState({
    category: (income.category || 'SERVICE') as IncomeCategory,
    label: income.label || '',
    amount: income.amount != null ? String(income.amount) : '',
    receivedOn: income.received_on || todayKey(),
    note: income.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = form.label.trim().length > 0 && Number(form.amount) > 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (income.isNew) await api.post('/api/incomes', payload);
      else await api.patch(`/api/incomes/${income.id}`, payload);
      onSaved();
    } catch (issue) {
      setError(errorMessage(issue));
      setBusy(false);
    }
  }

  return (
    <Sheet open title={income.isNew ? 'Nouvelle recette' : 'Modifier la recette'} onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="chips">
        {INCOME_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={`chip ${form.category === category ? 'chip--on' : ''}`}
            aria-pressed={form.category === category}
            onClick={() => setForm((f) => ({ ...f, category }))}
          >
            {INCOME_CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {/* Dit au moment de la saisie, pas après coup dans un rapport. */}
      {!isRevenue(form.category) ? (
        <Notice>
          Entre en caisse, mais pas dans le chiffre d’affaires : la vente a déjà été comptée le jour
          où elle a eu lieu.
        </Notice>
      ) : null}

      <TextField
        label="Libellé"
        placeholder="Découpe de fer, livraison chantier…"
        value={form.label}
        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
      />
      <TextField
        label={`Montant (${currency})`}
        type="number"
        inputMode="decimal"
        value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
      />
      <TextField
        label="Date de la recette"
        hint="Le jour où l’argent est entré, pas celui de la saisie."
        type="date"
        value={form.receivedOn}
        onChange={(e) => setForm((f) => ({ ...f, receivedOn: e.target.value }))}
      />
      <TextAreaField
        label="Note"
        rows={2}
        value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
      />

      <Button block onClick={save} disabled={!valid || busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>

      {!income.isNew && income.id ? (
        <Button block variant="danger" onClick={() => onDelete(income as IncomeRow)}>
          <Trash2 size={16} /> Supprimer
        </Button>
      ) : null}
    </Sheet>
  );
}
