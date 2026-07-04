'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  ShoppingBag,
  Package,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Users,
  Wallet,
} from 'lucide-react';
import storage from '../storage';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { fmt } from '../utils/formatCurrency';
import { getLast7Days, isSameDay, getDayLabel, todayISO, formatTime } from '../utils/dateHelpers';

const COLORS = {
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

function formatLongDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getPaymentBadgeVariant(payment) {
  if (!payment) return 'neutral';
  const p = payment.toLowerCase();
  if (p.includes('cash') || p.includes('espèce')) return 'success';
  if (p.includes('mobile') || p.includes('momo') || p.includes('orange')) return 'info';
  if (p.includes('crédit') || p.includes('credit')) return 'warning';
  return 'neutral';
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: COLORS.card2,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '13px',
          color: COLORS.text,
        }}
      >
        <div style={{ fontWeight: 700, color: COLORS.amber }}>{label}</div>
        <div>{fmt(payload[0].value)}</div>
      </div>
    );
  }
  return null;
}

function KpiCard({ icon, label, value, color }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            background: `${color}18`,
            borderRadius: '10px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <span style={{ fontSize: '13px', color: COLORS.muted, fontWeight: 500 }}>{label}</span>
      </div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: color,
          fontFamily: 'Syne, sans-serif',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </Card>
  );
}

function SummaryRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '14px', color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: '16px', fontWeight: 700, color: valueColor || COLORS.text }}>
        {value}
      </span>
    </div>
  );
}

export default function Dashboard() {
  // Read directly from storage (no hook) — reloads only on mount
  const products = storage.get('qp_products', []);
  const sales = storage.get('qp_sales', []);
  const expenses = storage.get('qp_expenses', []);
  const contacts = storage.get('qp_contacts', []);

  const today = todayISO();

  // Exclure les ventes annulées de tous les KPIs, graphiques et listes
  const activeSales = sales.filter((s) => s.status !== 'annulée');

  // --- KPI: Ventes aujourd'hui ---
  const todaySales = activeSales.filter((s) => isSameDay(s.date, today));
  const ventesAujourdhui = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);

  // --- KPI: Bénéfice du jour ---
  const beneficeDuJour = todaySales.reduce((sum, s) => {
    const revenue = s.total || 0;
    let cost = 0;
    if (Array.isArray(s.items)) {
      s.items.forEach((item) => {
        const product = products.find(
          (p) => p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase()
        );
        const buyPrice = product ? product.buyPrice || 0 : 0;
        cost += buyPrice * (item.qty || 0);
      });
    }
    return sum + (revenue - cost);
  }, 0);

  // --- KPI: Valeur du stock ---
  const valeurStock = products.reduce((sum, p) => sum + (p.qty || 0) * (p.buyPrice || 0), 0);

  // --- KPI: Dépenses du mois ---
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const depensesMois = expenses
    .filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  // --- Graph data: 7 derniers jours ---
  const last7 = getLast7Days();
  const chartData = last7.map((dayISO) => {
    const total = activeSales
      .filter((s) => isSameDay(s.date, dayISO))
      .reduce((sum, s) => sum + (s.total || 0), 0);
    return { day: getDayLabel(dayISO), value: total, date: dayISO };
  });

  // --- Alertes stock faible ---
  const lowStock = products.filter((p) => (p.qty || 0) <= (p.minQty || 0));

  // --- Dernières ventes (6) ---
  const lastSales = [...activeSales]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);

  // --- Résumé contacts ---
  const clients = contacts.filter((c) => c.type === 'client');
  const clientsWithCredit = clients.filter((c) => (c.creditBalance || 0) > 0);
  const totalCredit = clients.reduce((sum, c) => sum + (c.creditBalance || 0), 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '28px',
            fontWeight: 700,
            color: COLORS.amber,
            fontFamily: 'Syne, sans-serif',
            lineHeight: 1.2,
          }}
        >
          Tableau de bord
        </h1>
        <div style={{ marginTop: '6px', fontSize: '15px', color: COLORS.muted }}>
          {capitalize(formatLongDate(today))}
        </div>
      </div>

      {/* KPIs — responsive grid */}
      <div className="responsive-grid auto-fit" style={{ marginBottom: '28px' }}>
        <KpiCard
          icon={<ShoppingBag size={20} color={COLORS.green} />}
          label="Ventes aujourd'hui"
          value={fmt(ventesAujourdhui)}
          color={COLORS.green}
        />
        <KpiCard
          icon={
            beneficeDuJour >= 0 ? (
              <TrendingUp size={20} color={COLORS.green} />
            ) : (
              <TrendingDown size={20} color={COLORS.red} />
            )
          }
          label="Bénéfice du jour"
          value={fmt(beneficeDuJour)}
          color={beneficeDuJour >= 0 ? COLORS.green : COLORS.red}
        />
        <KpiCard
          icon={<Package size={20} color={COLORS.amber} />}
          label="Valeur du stock"
          value={fmt(valeurStock)}
          color={COLORS.amber}
        />
        <KpiCard
          icon={<TrendingDown size={20} color={COLORS.terra} />}
          label="Dépenses du mois"
          value={fmt(depensesMois)}
          color={COLORS.terra}
        />
        <KpiCard
          icon={<Wallet size={20} color={COLORS.blue} />}
          label="Créances clients"
          value={fmt(totalCredit)}
          color={COLORS.blue}
        />
      </div>

      {/* Chart + Alerts — responsive grid */}
      <div className="responsive-grid auto-fit" style={{ marginBottom: '28px' }}>
        {/* Bar Chart */}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: COLORS.text,
              fontFamily: 'Syne, sans-serif',
              marginBottom: '16px',
            }}
          >
            Ventes — 7 derniers jours
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fill: COLORS.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,166,35,0.07)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.date === today ? COLORS.amber : `${COLORS.amber}55`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Low stock alerts */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '15px',
              color: COLORS.text,
              fontFamily: 'Syne, sans-serif',
              marginBottom: '14px',
            }}
          >
            <AlertTriangle size={17} color={COLORS.terra} />
            Alertes stock
          </div>
          {lowStock.length === 0 ? (
            <div
              style={{
                color: COLORS.green,
                fontSize: '14px',
                padding: '12px 0',
                textAlign: 'center',
              }}
            >
              Tous les stocks sont suffisants
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lowStock.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 10px',
                    background: COLORS.card2,
                    borderRadius: '8px',
                    border: `1px solid ${COLORS.border}`,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '100px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: COLORS.text }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '12px', color: COLORS.muted, marginTop: '2px' }}>
                      Stock: {p.qty} {p.unit || ''}&nbsp;|&nbsp;Min: {p.minQty} {p.unit || ''}
                    </div>
                  </div>
                  <Badge variant="danger">Stock faible</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Last sales + contacts summary — responsive grid */}
      <div className="responsive-grid auto-fit">
        {/* Last 6 sales */}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: COLORS.text,
              fontFamily: 'Syne, sans-serif',
              marginBottom: '14px',
            }}
          >
            Dernières ventes
          </div>
          {lastSales.length === 0 ? (
            <div
              style={{
                color: COLORS.muted,
                fontSize: '14px',
                textAlign: 'center',
                padding: '12px 0',
              }}
            >
              Aucune vente enregistrée
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lastSales.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 10px',
                    background: COLORS.card2,
                    borderRadius: '8px',
                    border: `1px solid ${COLORS.border}`,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flex: 1,
                      minWidth: '120px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        color: COLORS.muted,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatTime(s.date)}
                    </span>
                    <span style={{ fontSize: '13px', color: COLORS.text, fontWeight: 500 }}>
                      {s.clientName || '—'}
                    </span>
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                  >
                    {s.payment && (
                      <Badge variant={getPaymentBadgeVariant(s.payment)}>{s.payment}</Badge>
                    )}
                    <span style={{ fontWeight: 700, color: COLORS.amber, fontSize: '13px' }}>
                      {fmt(s.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Contacts summary */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '15px',
              color: COLORS.text,
              fontFamily: 'Syne, sans-serif',
              marginBottom: '16px',
            }}
          >
            <Users size={17} color={COLORS.blue} />
            Résumé contacts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <SummaryRow
              label="Clients enregistrés"
              value={clients.length}
              valueColor={COLORS.text}
            />
            <SummaryRow
              label="Clients avec crédit"
              value={clientsWithCredit.length}
              valueColor={COLORS.terra}
            />
            <div
              style={{
                borderTop: `1px solid ${COLORS.border}`,
                paddingTop: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '14px', color: COLORS.muted }}>Total crédit en cours</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: COLORS.blue }}>
                {fmt(totalCredit)}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
