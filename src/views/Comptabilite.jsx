'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Printer } from 'lucide-react';
import storage from '../storage';
import useSettings from '../hooks/useSettings';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { fmt } from '../utils/formatCurrency';
import {
  getMonthRange,
  isInRange,
  isSameDay,
  getDayLabel,
  formatDate,
} from '../utils/dateHelpers';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format a Date → DD/MM */
function shortDate(d) {
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
}

/** Format a Date → "YYYY-MM-DD" (local) */
function toISODate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

const MONTH_LABELS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const PRESETS = [
  { key: '7j', label: '7 jours' },
  { key: 'mois', label: 'Ce mois' },
  { key: 'mois-1', label: 'Mois dernier' },
  { key: 'annee', label: 'Cette année' },
];

/** Returns {start:'YYYY-MM-DD', end:'YYYY-MM-DD'} for a preset key */
function presetRange(key) {
  const now = new Date();
  if (key === '7j') {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { start: toISODate(s), end: toISODate(now) };
  }
  if (key === 'mois-1') {
    const { start, end } = getMonthRange(now, -1);
    return { start: toISODate(start), end: toISODate(end) };
  }
  if (key === 'annee') {
    return { start: now.getFullYear() + '-01-01', end: now.getFullYear() + '-12-31' };
  }
  // 'mois' (défaut)
  const { start, end } = getMonthRange(now, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function SecTitle({ children }) {
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

function KpiCard({ label, value, color, sub }) {
  return (
    <div
      style={{
        background: C.card,
        border: '1px solid ' + C.border,
        borderRadius: '12px',
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          color: C.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 800,
          color: color,
          marginTop: '6px',
          fontFamily: 'Syne, sans-serif',
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: C.card2,
        border: '1px solid ' + C.border,
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '13px',
        color: C.text,
      }}
    >
      <div style={{ fontWeight: 700, color: C.amber, marginBottom: '4px' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name} : {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Comptabilite() {
  const { settings } = useSettings();
  const [range, setRange] = useState(() => presetRange('mois'));
  const [preset, setPreset] = useState('mois');
  const [openDay, setOpenDay] = useState(null); // accordion

  // Load data from storage (read-only — fresh on each render)
  const sales = storage.get('qp_sales', []);
  const expenses = storage.get('qp_expenses', []);
  const products = storage.get('qp_products', []);
  const purchases = storage.get('qp_purchases', []);
  const contacts = storage.get('qp_contacts', []);

  // ── Period bounds ───────────────────────────────────────────────────────────
  const startDate = useMemo(() => new Date(range.start + 'T00:00:00'), [range.start]);
  const endDate = useMemo(() => new Date(range.end + 'T23:59:59.999'), [range.end]);

  function applyPreset(key) {
    setPreset(key);
    setRange(presetRange(key));
    setOpenDay(null);
  }

  function setBound(field, value) {
    if (!value) return; // ignore cleared input
    setPreset(null);
    setRange((prev) => ({ ...prev, [field]: value }));
    setOpenDay(null);
  }

  // ── Filter to period (exclude cancelled sales everywhere) ───────────────────
  const periodSales = useMemo(
    () =>
      sales.filter((s) => s.status !== 'annulée' && isInRange(s.date, startDate, endDate)),
    [sales, startDate, endDate]
  );
  const periodExpenses = useMemo(
    () => expenses.filter((e) => isInRange(e.date, startDate, endDate)),
    [expenses, startDate, endDate]
  );
  const periodPurchases = useMemo(
    () =>
      purchases.filter(
        (p) => p.status === 'reçu' && isInRange(p.receivedAt || p.date, startDate, endDate)
      ),
    [purchases, startDate, endDate]
  );

  // ── KPI calculations ────────────────────────────────────────────────────────
  const chiffreAffaires = useMemo(
    () => periodSales.reduce((s, v) => s + (v.total || 0), 0),
    [periodSales]
  );

  const margeBrute = useMemo(
    () =>
      periodSales.reduce((sum, sale) => {
        if (!Array.isArray(sale.items)) return sum;
        return (
          sum +
          sale.items.reduce((s, item) => {
            const prod = products.find(
              (p) =>
                p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase()
            );
            const buyPrice = prod ? prod.buyPrice || 0 : 0;
            return s + ((item.unitPrice || 0) - buyPrice) * (item.qty || 0);
          }, 0)
        );
      }, 0),
    [periodSales, products]
  );

  const totalDepenses = useMemo(
    () => periodExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [periodExpenses]
  );

  const achatsRecus = useMemo(
    () => periodPurchases.reduce((s, p) => s + (p.total || 0), 0),
    [periodPurchases]
  );

  const beneficeNet = margeBrute - totalDepenses;

  // Créances en cours (indépendant de la période)
  const creances = useMemo(
    () =>
      contacts
        .filter((c) => c.type === 'client')
        .reduce((s, c) => s + (c.creditBalance || 0), 0),
    [contacts]
  );

  // ── Chart data (daily buckets ≤ 31 days, monthly beyond) ────────────────────
  const chartData = useMemo(() => {
    const nbDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
    if (nbDays <= 31) {
      const days = [];
      const d = new Date(startDate);
      while (d <= endDate) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      return days.map((day) => ({
        label: shortDate(day),
        Recettes: periodSales
          .filter((s) => isSameDay(s.date, day))
          .reduce((s, v) => s + (v.total || 0), 0),
        Dépenses: periodExpenses
          .filter((e) => isSameDay(e.date, day))
          .reduce((s, e) => s + (e.amount || 0), 0),
      }));
    }
    // Monthly buckets
    const spansYears = startDate.getFullYear() !== endDate.getFullYear();
    const months = [];
    const m = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (m <= endDate) {
      const mStart = new Date(m);
      const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
      months.push({
        label: MONTH_LABELS[m.getMonth()] + (spansYears ? ' ' + String(m.getFullYear()).slice(2) : ''),
        start: mStart,
        end: mEnd,
      });
      m.setMonth(m.getMonth() + 1);
    }
    return months.map(({ label, start, end }) => ({
      label,
      Recettes: periodSales
        .filter((s) => isInRange(s.date, start, end))
        .reduce((s, v) => s + (v.total || 0), 0),
      Dépenses: periodExpenses
        .filter((e) => isInRange(e.date, start, end))
        .reduce((s, e) => s + (e.amount || 0), 0),
    }));
  }, [startDate, endDate, periodSales, periodExpenses]);

  // ── Payment breakdown ───────────────────────────────────────────────────────
  const paymentData = useMemo(() => {
    const cash = periodSales
      .filter((s) => /cash|espèce/i.test(s.payment || ''))
      .reduce((s, v) => s + (v.total || 0), 0);
    const mobile = periodSales
      .filter((s) => /mobile|momo|orange/i.test(s.payment || ''))
      .reduce((s, v) => s + (v.total || 0), 0);
    const credit = periodSales
      .filter((s) => /crédit|credit/i.test(s.payment || ''))
      .reduce((s, v) => s + (v.total || 0), 0);
    const total = chiffreAffaires || 1;
    return [
      { label: 'Cash', amount: cash, pct: (cash / total) * 100, color: C.green },
      { label: 'Mobile Money', amount: mobile, pct: (mobile / total) * 100, color: C.blue },
      { label: 'Crédit', amount: credit, pct: (credit / total) * 100, color: C.amber },
    ];
  }, [periodSales, chiffreAffaires]);

  // ── Accordion: days with activity within the period (most recent first) ─────
  const { accordionDays, activeDayCount } = useMemo(() => {
    const map = new Map();
    const keyOf = (dstr) => {
      const d = new Date(
        typeof dstr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dstr) ? dstr + 'T00:00:00' : dstr
      );
      return toISODate(d);
    };
    periodSales.forEach((s) => {
      const k = keyOf(s.date);
      if (!map.has(k)) map.set(k, { daySales: [], dayExpenses: [] });
      map.get(k).daySales.push(s);
    });
    periodExpenses.forEach((e) => {
      const k = keyOf(e.date);
      if (!map.has(k)) map.set(k, { daySales: [], dayExpenses: [] });
      map.get(k).dayExpenses.push(e);
    });
    const entries = [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 31)
      .map(([dayISO, { daySales, dayExpenses }]) => {
        const dayTotal =
          daySales.reduce((s, v) => s + (v.total || 0), 0) -
          dayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
        return { dayISO, daySales, dayExpenses, dayTotal };
      });
    return { accordionDays: entries, activeDayCount: map.size };
  }, [periodSales, periodExpenses]);

  const hasData = periodSales.length > 0 || periodExpenses.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      {/* Print-only styles: only the report block is printed */}
      <style>{`
        .bilan-print { display: none; }
        @media print {
          body * { visibility: hidden; }
          .bilan-print, .bilan-print * { visibility: visible; }
          .bilan-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; background: #fff; }
          @page { margin: 15mm; }
        }
      `}</style>

      <div>
        {/* ── HEADER ─────────────────────────────────────── */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <h1
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: '28px',
                fontWeight: 800,
                color: C.amber,
                margin: 0,
              }}
            >
              Comptabilité
            </h1>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} /> Imprimer le bilan
            </Button>
          </div>

          {/* Period selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                style={{
                  background: preset === key ? C.amber : C.card,
                  color: preset === key ? '#0D0905' : C.text,
                  border: '1px solid ' + (preset === key ? C.amber : C.border),
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            ))}
            <div style={{ minWidth: '150px' }}>
              <Input
                label="Du"
                type="date"
                value={range.start}
                max={range.end}
                onChange={(e) => setBound('start', e.target.value)}
              />
            </div>
            <div style={{ minWidth: '150px' }}>
              <Input
                label="Au"
                type="date"
                value={range.end}
                min={range.start}
                onChange={(e) => setBound('end', e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: '10px', fontSize: '13px', color: C.muted }}>
            Période du {formatDate(range.start)} au {formatDate(range.end)}
          </div>
        </div>

        {!hasData && (
          <div
            style={{
              textAlign: 'center',
              color: C.muted,
              padding: '40px 0',
              fontSize: '15px',
              background: C.card,
              borderRadius: '12px',
              border: '1px solid ' + C.border,
              marginBottom: '24px',
            }}
          >
            Aucune donnée pour cette période.
          </div>
        )}

        {/* ── KPIs ───────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginBottom: '24px',
          }}
        >
          <KpiCard
            label="Chiffre d'affaires"
            value={fmt(chiffreAffaires)}
            color={C.green}
            sub={periodSales.length + ' vente' + (periodSales.length !== 1 ? 's' : '')}
          />
          <KpiCard
            label="Marge brute"
            value={fmt(margeBrute)}
            color={margeBrute >= 0 ? C.green : C.red}
            sub="Prix de vente − prix d'achat"
          />
          <KpiCard label="Dépenses" value={fmt(totalDepenses)} color={C.terra} />
          <KpiCard
            label="Achats reçus"
            value={fmt(achatsRecus)}
            color={C.blue}
            sub={periodPurchases.length + ' réception' + (periodPurchases.length !== 1 ? 's' : '')}
          />
          <KpiCard
            label="Bénéfice net"
            value={fmt(beneficeNet)}
            color={beneficeNet >= 0 ? C.green : C.red}
            sub="Marge brute − dépenses"
          />
          <KpiCard
            label="Créances en cours"
            value={fmt(creances)}
            color={C.amber}
            sub="Toutes périodes confondues"
          />
        </div>

        {/* ── GRAPHIQUE DOUBLE BARRES ─────────────────────── */}
        <Panel style={{ marginBottom: '24px' }}>
          <SecTitle>Recettes & Dépenses — période</SecTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: C.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,166,35,0.06)' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: C.muted, paddingTop: '8px' }} />
              <Bar dataKey="Recettes" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Dépenses" fill={C.terra} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* ── LOWER GRID ─────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            marginBottom: '24px',
            alignItems: 'start',
          }}
        >
          {/* Encaissements par mode de paiement */}
          <Panel>
            <SecTitle>Encaissements par mode de paiement</SecTitle>
            {chiffreAffaires === 0 ? (
              <p
                style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '12px 0' }}
              >
                Aucune vente sur cette période.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {paymentData.map(({ label, amount, pct, color }) => (
                  <div key={label}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ color: C.text }}>{label}</span>
                      <span style={{ fontWeight: 700, color: color }}>
                        {fmt(amount)}
                        <span
                          style={{
                            color: C.muted,
                            fontWeight: 400,
                            fontSize: '11px',
                            marginLeft: '6px',
                          }}
                        >
                          {pct.toFixed(0)}%
                        </span>
                      </span>
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
                          background: color,
                          borderRadius: '99px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Period summary */}
          <Panel>
            <SecTitle>Résumé de la période</SecTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Transactions', value: periodSales.length },
                { label: "Chiffre d'affaires", value: fmt(chiffreAffaires), color: C.green },
                {
                  label: 'Marge brute',
                  value: fmt(margeBrute),
                  color: margeBrute >= 0 ? C.green : C.red,
                },
                { label: 'Dépenses', value: fmt(totalDepenses), color: C.terra },
                { label: 'Achats reçus', value: fmt(achatsRecus), color: C.blue },
                {
                  label: 'Bénéfice net',
                  value: fmt(beneficeNet),
                  color: beneficeNet >= 0 ? C.green : C.red,
                },
                { label: 'Créances en cours (hors période)', value: fmt(creances), color: C.amber },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '10px',
                    borderBottom: '1px solid ' + C.border,
                  }}
                >
                  <span style={{ fontSize: '13px', color: C.muted }}>{label}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: color || C.text }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── DÉTAIL PAR JOUR (jours avec activité) ──────── */}
        <Panel>
          <SecTitle>Détail par jour</SecTitle>
          {accordionDays.length === 0 ? (
            <p style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '12px 0' }}>
              Aucune opération sur cette période.
            </p>
          ) : (
            <>
              {activeDayCount > 31 && (
                <p style={{ color: C.muted, fontSize: '12px', margin: '0 0 10px' }}>
                  Affichage limité aux 31 derniers jours actifs de la période (
                  {activeDayCount} jours au total).
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {accordionDays.map(({ dayISO, daySales, dayExpenses, dayTotal }) => {
                  const isOpen = openDay === dayISO;
                  const dayLabel = getDayLabel(dayISO + 'T00:00:00');
                  const dayStr = formatDate(dayISO);

                  return (
                    <div
                      key={dayISO}
                      style={{
                        border: '1px solid ' + (isOpen ? C.amber + '55' : C.border),
                        borderRadius: '10px',
                        overflow: 'hidden',
                        background: C.card2,
                      }}
                    >
                      {/* Header row */}
                      <button
                        onClick={() => setOpenDay(isOpen ? null : dayISO)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: C.text,
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color: C.amber,
                              minWidth: '32px',
                              fontSize: '13px',
                            }}
                          >
                            {dayLabel}
                          </span>
                          <span style={{ fontSize: '12px', color: C.muted }}>{dayStr}</span>
                          <span
                            style={{
                              fontSize: '11px',
                              color: C.muted,
                              background: C.card,
                              border: '1px solid ' + C.border,
                              borderRadius: '99px',
                              padding: '2px 8px',
                            }}
                          >
                            {daySales.length} vente{daySales.length !== 1 ? 's' : ''}
                            {dayExpenses.length > 0 ? ', ' + dayExpenses.length + ' dép.' : ''}
                          </span>
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '14px',
                            color: dayTotal >= 0 ? C.green : C.red,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {dayTotal >= 0 ? '+' : ''}
                          {fmt(dayTotal)}
                        </span>
                        <span
                          style={{
                            color: C.muted,
                            marginLeft: '4px',
                            fontSize: '16px',
                            lineHeight: 1,
                          }}
                        >
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </button>

                      {/* Expanded content */}
                      {isOpen && (
                        <div style={{ padding: '0 14px 14px', borderTop: '1px solid ' + C.border }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              marginTop: '10px',
                            }}
                          >
                            {/* Ventes */}
                            {daySales.map((sale) => (
                              <div
                                key={sale.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 10px',
                                  background: 'rgba(46,170,107,0.07)',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(46,170,107,0.2)',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  style={{ fontSize: '11px', fontWeight: 700, color: C.green }}
                                >
                                  VENTE
                                </span>
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: '13px',
                                    color: C.text,
                                    minWidth: '60px',
                                  }}
                                >
                                  {sale.clientName || 'Client'}&nbsp;
                                  {sale.payment && (
                                    <span style={{ color: C.muted, fontSize: '11px' }}>
                                      ({sale.payment})
                                    </span>
                                  )}
                                </span>
                                {Array.isArray(sale.items) && (
                                  <span style={{ fontSize: '11px', color: C.muted }}>
                                    {sale.items.map((i) => i.qty + ' × ' + i.name).join(', ')}
                                  </span>
                                )}
                                <span
                                  style={{ fontWeight: 700, color: C.green, whiteSpace: 'nowrap' }}
                                >
                                  +{fmt(sale.total || 0)}
                                </span>
                              </div>
                            ))}

                            {/* Dépenses */}
                            {dayExpenses.map((exp) => (
                              <div
                                key={exp.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 10px',
                                  background: 'rgba(212,98,42,0.07)',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(212,98,42,0.2)',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  style={{ fontSize: '11px', fontWeight: 700, color: C.terra }}
                                >
                                  DÉP.
                                </span>
                                <span style={{ fontSize: '11px', color: C.muted }}>{exp.cat}</span>
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: '13px',
                                    color: C.text,
                                    minWidth: '60px',
                                  }}
                                >
                                  {exp.description || '—'}
                                </span>
                                <span
                                  style={{ fontWeight: 700, color: C.terra, whiteSpace: 'nowrap' }}
                                >
                                  −{fmt(exp.amount || 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ── BILAN IMPRIMABLE (visible uniquement à l'impression) ─────────────── */}
      <div
        className="bilan-print"
        style={{
          background: '#fff',
          color: '#111',
          fontFamily: 'Arial, sans-serif',
          padding: '24px',
        }}
      >
        {/* Doc header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          }}
        >
          <div>
            <div
              style={{ fontSize: '24px', fontWeight: 900, color: '#111', letterSpacing: '0.02em' }}
            >
              {(settings.storeName || 'Ma Boutique').toUpperCase()}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
              Bilan comptable
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#111' }}>
              Période : du {formatDate(range.start)} au {formatDate(range.end)}
            </div>
            <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
              Édité le {formatDate(new Date())}
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '0 0 20px' }} />

        {/* KPIs */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <tbody>
            {[
              { label: "Chiffre d'affaires (ventes non annulées)", value: fmt(chiffreAffaires) },
              { label: 'Marge brute', value: fmt(margeBrute) },
              { label: 'Dépenses', value: fmt(totalDepenses) },
              { label: 'Achats reçus', value: fmt(achatsRecus) },
              { label: 'Bénéfice net (marge brute − dépenses)', value: fmt(beneficeNet), bold: true },
            ].map(({ label, value, bold }) => (
              <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                <td
                  style={{
                    padding: '9px 4px',
                    fontSize: '13px',
                    color: '#333',
                    fontWeight: bold ? 800 : 400,
                  }}
                >
                  {label}
                </td>
                <td
                  style={{
                    padding: '9px 4px',
                    fontSize: '13px',
                    color: '#111',
                    textAlign: 'right',
                    fontWeight: bold ? 800 : 700,
                  }}
                >
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Encaissements */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}
        >
          Encaissements par mode de paiement
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <tbody>
            {paymentData.map(({ label, amount, pct }) => (
              <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 4px', fontSize: '13px', color: '#333' }}>{label}</td>
                <td
                  style={{
                    padding: '8px 4px',
                    fontSize: '13px',
                    color: '#111',
                    textAlign: 'right',
                    fontWeight: 700,
                  }}
                >
                  {fmt(amount)}
                  <span style={{ color: '#888', fontWeight: 400, marginLeft: '8px' }}>
                    {chiffreAffaires > 0 ? pct.toFixed(0) + '%' : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Créances */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}
        >
          Créances clients en cours
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 4px',
            borderBottom: '1px solid #eee',
          }}
        >
          <span style={{ fontSize: '13px', color: '#333' }}>
            Total des crédits clients (toutes périodes confondues)
          </span>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#111' }}>{fmt(creances)}</span>
        </div>

        <div style={{ marginTop: '28px', fontSize: '11px', color: '#999', textAlign: 'center' }}>
          Document généré par {settings.storeName || 'Ma Boutique'} — données locales au navigateur.
        </div>
      </div>
    </div>
  );
}
