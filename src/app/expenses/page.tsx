'use client';

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Paperclip, Plus, Receipt, Trash2 } from 'lucide-react';
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
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, isOperating } from '@/domain/report';
import ReceiptField from '@/components/expenses/ReceiptField';
import { errorMessage } from '@/utils/errors';
import { money, shortDate } from '@/utils/format';
import type { ExpenseCategory, ExpenseRow } from '@/types';

/**
 * Dépenses de la boutique (§39).
 *
 * C'est l'écran sans lequel « bénéfice net » resterait un mot : la marge brute
 * ne déduit que les marchandises (§13), et le loyer ne se déduit que s'il est
 * noté. La saisie est donc tenue courte — poste, libellé, montant, date — pour
 * qu'elle se fasse vraiment, tous les jours, sur un téléphone.
 *
 * La date est celle où l'argent est sorti, pas celle de la saisie : le transport
 * de la veille se note le lendemain matin, et doit peser sur la veille.
 */

const PERIODS = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last-month', label: 'Mois dernier' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
];

/** Dépense en cours de saisie. `isNew` n'existe qu'à l'écran. */
type Editing = Partial<ExpenseRow> & { isNew?: boolean };

/** Date du jour au format attendu par un champ `date`. */
function todayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function ExpensesPage() {
  const { currency, isOwner } = useSession();
  const [period, setPeriod] = useState('month');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useResource<ExpenseRow[]>('/api/expenses', {
    period,
  });

  const expenses = data || [];
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  // L'achat de stock est une sortie de caisse, pas une charge : le distinguer ici
  // évite qu'un mois de réassort soit lu comme un mois de frais (§39, §40).
  const stock = expenses
    .filter((expense) => !isOperating(expense.category))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  async function remove(expense: ExpenseRow) {
    setError(null);
    try {
      await api.delete(`/api/expenses/${expense.id}`);
      setEditing(null);
      reload();
    } catch (issue) {
      setError(errorMessage(issue));
    }
  }

  return (
    <>
      <AppBar back="/reports" title="Dépenses" />

      <main className="page">
        {!isOwner ? (
          <Notice tone="warn">Seul le propriétaire enregistre les dépenses de la boutique.</Notice>
        ) : null}

        <Segmented options={PERIODS} value={period} onChange={setPeriod} />

        {error ? <Notice tone="error">{error}</Notice> : null}
        {loadError ? <Notice tone="error">{loadError.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={64} /> : null}

        {data ? (
          <Card>
            <CardHead
              title="Dépenses de la période"
              action={
                <Link href="/reports" className="link">
                  Rapports
                </Link>
              }
            />
            {expenses.length === 0 ? (
              <Empty
                icon={<Receipt size={26} className="muted" />}
                title="Aucune dépense"
                hint="Loyer, énergie, salaires, transport : ce qui n’est pas noté ici ne sera pas déduit du bénéfice."
              />
            ) : (
              <>
                <div className="list">
                  {expenses.map((expense) => (
                    <button
                      key={expense.id}
                      type="button"
                      className="list__row"
                      disabled={!isOwner}
                      onClick={() => setEditing(expense)}
                    >
                      <div className="list__body">
                        <div className="list__title">
                          {expense.label}
                          {expense.has_receipt ? (
                            <Paperclip
                              size={13}
                              className="muted"
                              style={{ verticalAlign: -1, marginLeft: 6 }}
                              aria-label="Justificatif joint"
                            />
                          ) : null}
                        </div>
                        <div className="list__sub">
                          {EXPENSE_CATEGORY_LABELS[expense.category]} ·{' '}
                          {shortDate(expense.spent_on)}
                        </div>
                      </div>
                      <strong className="num">{money(expense.amount, currency)}</strong>
                    </button>
                  ))}
                </div>
                <div className="card--pad">
                  <div className="total-line total-line--grand">
                    <span>Total sorti de caisse</span>
                    <span className="amount num">{money(total, currency)}</span>
                  </div>
                  {stock > 0 ? (
                    <p className="muted small">
                      Dont {money(stock, currency)} d’achat de stock, qui sort de la caisse sans
                      réduire votre bénéfice : la marchandise est déjà comptée à son coût au moment
                      où elle est vendue.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </Card>
        ) : null}
      </main>

      {isOwner ? (
        <button
          type="button"
          className="fab"
          aria-label="Nouvelle dépense"
          onClick={() => setEditing({ isNew: true })}
        >
          <Plus size={26} />
        </button>
      ) : null}

      {editing ? (
        <ExpenseSheet
          expense={editing}
          onClose={() => setEditing(null)}
          onDelete={remove}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function ExpenseSheet({
  expense,
  onClose,
  onSaved,
  onDelete,
}: {
  expense: Editing;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (expense: ExpenseRow) => void;
}) {
  const [form, setForm] = useState({
    category: (expense.category || 'RENT') as ExpenseCategory,
    label: expense.label || '',
    amount: expense.amount === undefined ? '' : String(expense.amount),
    spentOn: expense.spent_on || todayKey(),
    note: expense.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Le justificatif est joint par sa propre route, sans passer par « Enregistrer » :
  // son état vit donc ici, pour que la vignette apparaisse dès l'envoi.
  const [joint, setJoint] = useState(Boolean(expense.has_receipt));

  const set =
    (field: 'label' | 'amount' | 'spentOn' | 'note') =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [field]: event.target.value });

  const amount = Number(form.amount.replace(',', '.'));
  const valid = form.label.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, amount };
      if (expense.isNew) await api.post('/api/expenses', body);
      else await api.patch(`/api/expenses/${expense.id}`, body);
      onSaved();
    } catch (issue) {
      setError(errorMessage(issue));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      title={expense.isNew ? 'Nouvelle dépense' : 'Modifier la dépense'}
      onClose={onClose}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}

      <span className="field__label">Poste</span>
      <div className="category-grid">
        {EXPENSE_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className="segmented__item"
            data-active={category === form.category}
            aria-pressed={category === form.category}
            onClick={() => setForm({ ...form, category })}
          >
            {EXPENSE_CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      <TextField
        label="Libellé"
        placeholder="Loyer de septembre, taxi-bagages…"
        value={form.label}
        onChange={set('label')}
        required
      />
      <TextField
        label="Montant"
        type="number"
        inputMode="decimal"
        min={0}
        step="1"
        value={form.amount}
        onChange={set('amount')}
        required
      />
      <TextField
        label="Date de la dépense"
        hint="Le jour où l’argent est sorti, pas celui de la saisie."
        type="date"
        value={form.spentOn}
        onChange={set('spentOn')}
      />
      <TextAreaField label="Note" rows={2} value={form.note} onChange={set('note')} />

      <ReceiptField
        expenseId={expense.id ?? null}
        hasReceipt={joint}
        onChange={(present) => setJoint(present)}
      />

      <Button block disabled={busy || !valid} onClick={save}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>

      {!expense.isNew && expense.id ? (
        <Button
          variant="danger"
          block
          disabled={busy}
          onClick={() => onDelete(expense as ExpenseRow)}
        >
          <Trash2 size={17} /> Supprimer cette dépense
        </Button>
      ) : null}
    </Sheet>
  );
}
