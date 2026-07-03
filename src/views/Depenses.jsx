'use client';

import React, { useState, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import useExpenses from '../hooks/useExpenses';
import { fmt } from '../utils/formatCurrency';
import { todayISO, formatDate } from '../utils/dateHelpers';
import { EXPENSE_CATEGORIES } from '../constants/categories';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';

const C = {
  bg: '#0D0905',
  card: '#1A1008',
  card2: '#221408',
  amber: '#F5A623',
  terra: '#D4622A',
  green: '#2EAA6B',
  red: '#D93B2A',
  blue: '#3A8FD4',
  text: '#F5EDD8',
  muted: '#8B7B64',
  border: '#362210',
};

function getCurrentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function emptyForm() {
  return { date: todayISO(), cat: EXPENSE_CATEGORIES[0], description: '', amount: '' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: '13px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: C.muted,
        marginBottom: '12px',
      }}
    >
      {children}
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        background: C.card,
        border: '1px solid ' + C.border,
        borderRadius: '12px',
        padding: '16px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Depenses() {
  const { expenses, addExpense, deleteExpense } = useExpenses();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  // ── Derived data ────────────────────────────────────────────────────────────

  const filteredExpenses = useMemo(
    () =>
      expenses
        .filter((e) => e.date && e.date.startsWith(selectedMonth))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, selectedMonth]
  );

  const totalMonth = useMemo(
    () => filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [filteredExpenses]
  );

  const byCategory = useMemo(() => {
    const map = {};
    filteredExpenses.forEach((e) => {
      map[e.cat] = (map[e.cat] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.date) {
      setFormError('La date est requise.');
      return;
    }
    const amt = Number(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      setFormError('Le montant doit être un nombre positif.');
      return;
    }
    addExpense(form);
    setForm({ ...emptyForm(), cat: form.cat, date: form.date });
    setFormError('');
  }

  function handleDelete(id, desc) {
    const label = desc ? '"' + desc + '"' : 'cette dépense';
    if (window.confirm('Supprimer la dépense ' + label + ' ?')) deleteExpense(id);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div>
        {/* ── HEADER ─────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: '28px',
                fontWeight: 800,
                color: C.amber,
                margin: 0,
              }}
            >
              Dépenses
            </h1>
            <p style={{ color: C.muted, fontSize: '13px', margin: '4px 0 0' }}>
              Suivi et saisie des dépenses
            </p>
          </div>

          {/* KPI total du mois */}
          <div
            style={{
              background: C.card2,
              border: '1px solid ' + C.border,
              borderRadius: '12px',
              padding: '12px 20px',
              textAlign: 'right',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Total du mois
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: C.terra, marginTop: '2px' }}>
              {fmt(totalMonth)}
            </div>
          </div>
        </div>

        {/* ── FILTRE MOIS ─────────────────────────────── */}
        <div
          style={{
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ fontSize: '13px', color: C.muted, fontWeight: 600 }}>Mois :</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              background: '#0D0905',
              border: '1px solid ' + C.border,
              borderRadius: '8px',
              padding: '8px 12px',
              color: C.text,
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: '13px', color: C.muted }}>
            {filteredExpenses.length} dépense{filteredExpenses.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── FORMULAIRE SAISIE ────────────────────────── */}
        <Panel style={{ marginBottom: '24px' }}>
          <SectionTitle>Nouvelle dépense</SectionTitle>
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <Input
                label="Date"
                type="date"
                value={form.date}
                required
                onChange={(e) => setField('date', e.target.value)}
              />
              <Select
                label="Catégorie"
                options={EXPENSE_CATEGORIES}
                value={form.cat}
                onChange={(e) => setField('cat', e.target.value)}
              />
              <Input
                label="Description"
                type="text"
                placeholder="Ex: Facture eau..."
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
              />
              <Input
                label="Montant (FCFA)"
                type="number"
                placeholder="0"
                min="1"
                step="1"
                value={form.amount}
                required
                onChange={(e) => setField('amount', e.target.value)}
              />
            </div>

            {formError && (
              <p style={{ color: C.red, fontSize: '13px', margin: '0 0 10px' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" size="md">
                + Ajouter
              </Button>
            </div>
          </form>
        </Panel>

        {/* ── RÉPARTITION + LISTE ──────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          {/* Répartition par catégorie */}
          <Panel>
            <SectionTitle>Répartition du mois</SectionTitle>
            {byCategory.length === 0 ? (
              <p
                style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '16px 0' }}
              >
                Aucune dépense ce mois.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {byCategory.map(({ cat, amount }) => {
                  const pct = totalMonth > 0 ? (amount / totalMonth) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ color: C.text }}>{cat}</span>
                        <span style={{ color: C.terra, fontWeight: 700 }}>{fmt(amount)}</span>
                      </div>
                      <div
                        style={{
                          height: '6px',
                          background: C.border,
                          borderRadius: '99px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: pct + '%',
                            background: C.terra,
                            borderRadius: '99px',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: '11px',
                          color: C.muted,
                          marginTop: '2px',
                        }}
                      >
                        {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Liste des dépenses */}
          <Panel>
            <SectionTitle>Liste des dépenses</SectionTitle>
            {filteredExpenses.length === 0 ? (
              <p
                style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '16px 0' }}
              >
                Aucune dépense pour ce mois.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '520px',
                  overflowY: 'auto',
                }}
              >
                {filteredExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      background: C.card2,
                      borderRadius: '8px',
                      border: '1px solid ' + C.border,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        color: C.muted,
                        whiteSpace: 'nowrap',
                        minWidth: '72px',
                      }}
                    >
                      {formatDate(exp.date)}
                    </span>
                    <Badge variant="neutral">{exp.cat}</Badge>
                    <span style={{ flex: 1, fontSize: '13px', color: C.text, minWidth: '60px' }}>
                      {exp.description || <em style={{ color: C.muted }}>—</em>}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: C.terra,
                        whiteSpace: 'nowrap',
                        fontSize: '14px',
                      }}
                    >
                      {fmt(exp.amount)}
                    </span>
                    <button
                      onClick={() => handleDelete(exp.id, exp.description)}
                      title="Supprimer"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: C.muted,
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '6px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
