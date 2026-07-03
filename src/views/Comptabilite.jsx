'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import storage from '../storage';
import { fmt } from '../utils/formatCurrency';
import { getWeekRange, isSameWeek, isSameDay, getDayLabel, formatDate } from '../utils/dateHelpers';

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

/** Build array of 7 Date objects from monday to sunday */
function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [openDay, setOpenDay] = useState(null); // accordion

  // Load data from storage (read-only — fresh on each render)
  const sales = storage.get('qp_sales', []);
  const expenses = storage.get('qp_expenses', []);
  const products = storage.get('qp_products', []);

  // ── Week range ──────────────────────────────────────────────────────────────
  const { start, end } = useMemo(() => getWeekRange(weekOffset), [weekOffset]);
  const days = useMemo(() => weekDays(start), [start]);

  // ── Filter to current week ──────────────────────────────────────────────────
  const weekSales = useMemo(
    () => sales.filter((s) => isSameWeek(s.date, start, end)),
    [sales, start, end]
  );
  const weekExpenses = useMemo(
    () => expenses.filter((e) => isSameWeek(e.date, start, end)),
    [expenses, start, end]
  );

  // ── KPI calculations ────────────────────────────────────────────────────────
  const recettes = useMemo(() => weekSales.reduce((s, v) => s + (v.total || 0), 0), [weekSales]);
  const depenses = useMemo(
    () => weekExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [weekExpenses]
  );

  const coutAchat = useMemo(
    () =>
      weekSales.reduce((sum, sale) => {
        if (!Array.isArray(sale.items)) return sum;
        return (
          sum +
          sale.items.reduce((s, item) => {
            const prod = products.find((p) => p.name === item.name);
            return s + (prod ? (item.qty || 0) * (prod.buyPrice || 0) : 0);
          }, 0)
        );
      }, 0),
    [weekSales, products]
  );

  const brutBenefit = recettes - coutAchat;
  const netBenefit = brutBenefit - depenses;

  // ── Chart data (7 days) ─────────────────────────────────────────────────────
  const chartData = useMemo(
    () =>
      days.map((day) => {
        const dayISO = day.toISOString().slice(0, 10);
        const rec = weekSales
          .filter((s) => isSameDay(s.date, dayISO))
          .reduce((s, v) => s + (v.total || 0), 0);
        const dep = weekExpenses
          .filter((e) => isSameDay(e.date, dayISO))
          .reduce((s, e) => s + (e.amount || 0), 0);
        return { day: getDayLabel(dayISO), Recettes: rec, Dépenses: dep };
      }),
    [days, weekSales, weekExpenses]
  );

  // ── Payment breakdown ───────────────────────────────────────────────────────
  const paymentData = useMemo(() => {
    const cash = weekSales
      .filter((s) => /cash|espèce/i.test(s.payment || ''))
      .reduce((s, v) => s + (v.total || 0), 0);
    const mobile = weekSales
      .filter((s) => /mobile|momo|orange/i.test(s.payment || ''))
      .reduce((s, v) => s + (v.total || 0), 0);
    const credit = weekSales
      .filter((s) => /crédit|credit/i.test(s.payment || ''))
      .reduce((s, v) => s + (v.total || 0), 0);
    const total = recettes || 1;
    return [
      { label: 'Cash', amount: cash, pct: (cash / total) * 100, color: C.green },
      { label: 'Mobile Money', amount: mobile, pct: (mobile / total) * 100, color: C.blue },
      { label: 'Crédit', amount: credit, pct: (credit / total) * 100, color: C.amber },
    ];
  }, [weekSales, recettes]);

  // ── Accordion days ──────────────────────────────────────────────────────────
  const accordionDays = useMemo(
    () =>
      days.map((day) => {
        const dayISO = day.toISOString().slice(0, 10);
        const daySales = weekSales.filter((s) => isSameDay(s.date, dayISO));
        const dayExpenses = weekExpenses.filter((e) => isSameDay(e.date, dayISO));
        const dayTotal =
          daySales.reduce((s, v) => s + (v.total || 0), 0) -
          dayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
        return { day, dayISO, daySales, dayExpenses, dayTotal };
      }),
    [days, weekSales, weekExpenses]
  );

  const hasData = weekSales.length > 0 || weekExpenses.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <div>
        {/* ── HEADER ─────────────────────────────────────── */}
        <div style={{ marginBottom: '24px' }}>
          <h1
            style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: '28px',
              fontWeight: 800,
              color: C.amber,
              margin: '0 0 12px',
            }}
          >
            Comptabilité
          </h1>

          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              style={{
                background: C.card,
                border: '1px solid ' + C.border,
                borderRadius: '8px',
                padding: '6px 10px',
                cursor: 'pointer',
                color: C.text,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: C.text,
                background: C.card,
                border: '1px solid ' + C.border,
                borderRadius: '8px',
                padding: '6px 14px',
              }}
            >
              Semaine du {shortDate(start)} au {shortDate(end)}
            </span>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              style={{
                background: C.card,
                border: '1px solid ' + C.border,
                borderRadius: '8px',
                padding: '6px 10px',
                cursor: 'pointer',
                color: C.text,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronRight size={18} />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.amber,
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Semaine courante
              </button>
            )}
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
            Aucune donnée pour cette semaine.
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
          <KpiCard label="Recettes" value={fmt(recettes)} color={C.green} />
          <KpiCard label="Dépenses" value={fmt(depenses)} color={C.terra} />
          <KpiCard
            label="Bénéfice brut"
            value={fmt(brutBenefit)}
            color={brutBenefit >= 0 ? C.green : C.red}
            sub={'Coût achat : ' + fmt(coutAchat)}
          />
          <KpiCard
            label="Bénéfice net"
            value={fmt(netBenefit)}
            color={netBenefit >= 0 ? C.green : C.red}
            sub={'Brut − dépenses'}
          />
        </div>

        {/* ── GRAPHIQUE DOUBLE BARRES ─────────────────────── */}
        <Panel style={{ marginBottom: '24px' }}>
          <SecTitle>Recettes & Dépenses — semaine</SecTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="day"
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
          {/* Modes de paiement */}
          <Panel>
            <SecTitle>Modes de paiement</SecTitle>
            {recettes === 0 ? (
              <p
                style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '12px 0' }}
              >
                Aucune vente cette semaine.
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

          {/* Weekly summary */}
          <Panel>
            <SecTitle>Résumé de la semaine</SecTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Transactions', value: weekSales.length },
                { label: 'Recettes totales', value: fmt(recettes), color: C.green },
                { label: 'Coût marchandises', value: fmt(coutAchat), color: C.muted },
                { label: 'Dépenses', value: fmt(depenses), color: C.terra },
                {
                  label: 'Bénéfice brut',
                  value: fmt(brutBenefit),
                  color: brutBenefit >= 0 ? C.green : C.red,
                },
                {
                  label: 'Bénéfice net',
                  value: fmt(netBenefit),
                  color: netBenefit >= 0 ? C.green : C.red,
                },
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

        {/* ── ACCORDÉON 7 JOURS ──────────────────────────── */}
        <Panel>
          <SecTitle>Détail par jour</SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {accordionDays.map(({ day, dayISO, daySales, dayExpenses, dayTotal }) => {
              const isOpen = openDay === dayISO;
              const hasItems = daySales.length > 0 || dayExpenses.length > 0;
              const dayLabel = getDayLabel(dayISO);
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
                      {hasItems && (
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
                      )}
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
                      style={{ color: C.muted, marginLeft: '4px', fontSize: '16px', lineHeight: 1 }}
                    >
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isOpen && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid ' + C.border }}>
                      {!hasItems ? (
                        <p style={{ color: C.muted, fontSize: '13px', margin: '12px 0' }}>
                          Aucune opération ce jour.
                        </p>
                      ) : (
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
                              <span style={{ fontSize: '11px', fontWeight: 700, color: C.green }}>
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
                              <span style={{ fontSize: '11px', fontWeight: 700, color: C.terra }}>
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
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
