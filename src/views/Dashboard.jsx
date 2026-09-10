'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  MapPin,
  Bell,
  Search,
  SlidersHorizontal,
  Package,
  ShoppingCart,
  Truck,
  HandCoins,
  TrendingDown,
  BarChart2,
  Users,
  FileText,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Cloud,
  Zap,
  Sparkles,
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
  });
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

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState('');

  const products = storage.get('qp_products', []);
  const sales = storage.get('qp_sales', []);
  const contacts = storage.get('qp_contacts', []);
  const settings = storage.get('qp_settings', {});

  const shopName = settings.shopName || 'Ma Boutique';
  const today = todayISO();

  // Filtre des ventes actives
  const activeSales = sales.filter((s) => s.status !== 'annulée');
  const todaySales = activeSales.filter((s) => isSameDay(s.date, today));
  const ventesAujourdhui = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);

  // Alertes stock faible
  const lowStock = products.filter((p) => (p.qty || 0) <= (p.minQty || 0));

  // Produits filtrés par la barre de recherche
  const filteredProducts = searchTerm.trim()
    ? products.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : products;

  // Graphique 7 derniers jours
  const last7 = getLast7Days();
  const chartData = last7.map((dayISO) => {
    const total = activeSales
      .filter((s) => isSameDay(s.date, dayISO))
      .reduce((sum, s) => sum + (s.total || 0), 0);
    return { day: getDayLabel(dayISO), value: total, date: dayISO };
  });

  const modules = [
    { label: 'Stock', icon: Package, href: '/stock', badge: lowStock.length > 0 ? lowStock.length : null, color: COLORS.amber },
    { label: 'Caisse', icon: ShoppingCart, href: '/caisse', color: COLORS.terra },
    { label: 'Achats', icon: Truck, href: '/achats', color: COLORS.blue },
    { label: 'Crédits', icon: HandCoins, href: '/credits', color: COLORS.amber },
    { label: 'Dépenses', icon: TrendingDown, href: '/depenses', color: COLORS.red },
    { label: 'Compta', icon: BarChart2, href: '/comptabilite', color: COLORS.amber },
    { label: 'Contacts', icon: Users, href: '/contacts', color: COLORS.blue },
    { label: 'Factures', icon: FileText, href: '/facturation', color: COLORS.terra },
  ];

  return (
    <div
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '16px 16px 32px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── TOP HEADER MOBILE / DESKTOP ─────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(245, 166, 35, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.amber,
            }}
          >
            <MapPin size={20} />
          </div>
          <div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: COLORS.text,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {shopName}
              <span style={{ fontSize: '10px', color: COLORS.muted }}>▾</span>
            </div>
            <div style={{ fontSize: '11px', color: COLORS.muted }}>
              {formatLongDate(today)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              position: 'relative',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: COLORS.card2,
              border: `1px solid ${COLORS.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.text,
              cursor: 'pointer',
            }}
          >
            <Bell size={18} />
            {lowStock.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: COLORS.terra,
                  border: `2px solid ${COLORS.card}`,
                }}
              />
            )}
          </div>
          <Link
            href="/caisse"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: COLORS.amber,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              textDecoration: 'none',
            }}
          >
            <ShoppingCart size={18} />
          </Link>
        </div>
      </div>

      {/* ── BARRE DE RECHERCHE RAPIDE ─────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={18}
            color={COLORS.muted}
            style={{ position: 'absolute', left: '14px' }}
          />
          <input
            type="text"
            placeholder="Rechercher un produit, une catégorie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: '44px',
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '12px',
              paddingLeft: '42px',
              paddingRight: '14px',
              color: COLORS.text,
              fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>
        <button
          type="button"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: COLORS.amber,
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>

      {/* ── BANNIÈRE HÉRO AMBRE / SOMBRE (THÈME QUINCAFLOW) ─────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #341F0B 0%, #1A0D04 100%)',
          border: '1px solid rgba(245, 166, 35, 0.35)',
          borderRadius: '20px',
          padding: '20px 20px 16px',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Glow effect ambre */}
        <div
          style={{
            position: 'absolute',
            right: '-30px',
            top: '-30px',
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            background: 'rgba(245, 166, 35, 0.2)',
            filter: 'blur(30px)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '13px', color: COLORS.amber, fontWeight: 600, letterSpacing: '0.5px' }}>
            CHIFFRE D’AFFAIRES DU JOUR
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: '#FFFFFF',
              fontFamily: 'Syne, sans-serif',
              margin: '6px 0 10px',
              lineHeight: 1.1,
            }}
          >
            {fmt(ventesAujourdhui)}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '12px',
              color: COLORS.text,
              marginBottom: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={14} color={COLORS.amber} />
              <span>{todaySales.length} vente{todaySales.length > 1 ? 's' : ''} effectuées</span>
            </div>
            <span>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} color={lowStock.length > 0 ? COLORS.terra : COLORS.amber} />
              <span>{lowStock.length} alerte{lowStock.length > 1 ? 's' : ''} stock</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Link
              href="/caisse"
              style={{
                flex: 1,
                background: COLORS.amber,
                color: '#000000',
                padding: '10px 14px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <ShoppingCart size={15} />
              Vente Rapide
            </Link>
            <Link
              href="/stock"
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                border: '1px solid rgba(245, 166, 35, 0.3)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '13px',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Package size={15} />
              Ajuster Stock
            </Link>
          </div>
        </div>

        {/* Indicateurs pagination dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '14px',
          }}
        >
          <div style={{ width: '16px', height: '5px', borderRadius: '3px', background: COLORS.amber }} />
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
        </div>
      </div>

      {/* ── MODULES & ACCÈS RAPIDE ─────── */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: 700,
              color: COLORS.text,
              fontFamily: 'Syne, sans-serif',
            }}
          >
            Modules & Accès Rapide
          </h2>
          <span
            style={{
              fontSize: '13px',
              color: COLORS.amber,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              cursor: 'pointer',
            }}
          >
            Voir tout <ChevronRight size={14} />
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
          }}
        >
          {modules.map(({ label, icon: Icon, href, badge, color }) => (
            <Link
              key={label}
              href={href}
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '16px',
                padding: '14px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: `${color}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: color,
                }}
              >
                <Icon size={22} />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: COLORS.text,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {label}
              </span>
              {badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: COLORS.terra,
                    color: '#FFF',
                    fontSize: '10px',
                    fontWeight: 700,
                    borderRadius: '10px',
                    padding: '2px 6px',
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* ── PRODUITS & ALERTES (SECTION HORIZONTALE SCROLLABLE) ── */}
      <div style={{ marginBottom: '28px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: 700,
              color: COLORS.text,
              fontFamily: 'Syne, sans-serif',
            }}
          >
            Recommandés & Alertes Stock
          </h2>
          <Link
            href="/stock"
            style={{
              fontSize: '13px',
              color: COLORS.amber,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              textDecoration: 'none',
            }}
          >
            Voir tout <ChevronRight size={14} />
          </Link>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '14px',
            overflowX: 'auto',
            paddingBottom: '8px',
            scrollbarWidth: 'none',
          }}
        >
          {filteredProducts.slice(0, 8).map((p) => {
            const isLow = (p.qty || 0) <= (p.minQty || 0);

            return (
              <div
                key={p.id}
                style={{
                  minWidth: '200px',
                  maxWidth: '220px',
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '18px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexShrink: 0,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isLow ? 'rgba(212, 98, 42, 0.18)' : 'rgba(245, 166, 35, 0.18)',
                        color: isLow ? COLORS.terra : COLORS.amber,
                      }}
                    >
                      {isLow ? 'Alerte Stock' : 'Bestseller'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: COLORS.amber }}>
                      ★ 4.8
                    </div>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: '80px',
                      borderRadius: '12px',
                      background: COLORS.card2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: COLORS.amber,
                      marginBottom: '10px',
                    }}
                  >
                    <Package size={34} />
                  </div>

                  <div style={{ fontWeight: 700, fontSize: '14px', color: COLORS.text, lineHeight: 1.3 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: '12px', color: COLORS.muted, marginTop: '2px' }}>
                    Stock: {p.qty} {p.unit || ''}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: COLORS.amber,
                      marginBottom: '8px',
                    }}
                  >
                    <ShieldCheck size={13} />
                    <span>Produit Vérifié</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 800, color: COLORS.amber }}>
                      {fmt(p.sellPrice || p.price || 0)}
                    </span>
                    <Link
                      href="/caisse"
                      style={{
                        background: COLORS.amber,
                        color: '#000',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Vendre
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BANDEAU RÉASSURANCE & ENGAGEMENTS ─────────────────── */}
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '16px',
          padding: '16px 12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
          <Cloud size={18} color={COLORS.amber} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: COLORS.text }}>Cloud Neon</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
          <ShieldCheck size={18} color={COLORS.amber} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: COLORS.text }}>Sauvegarde</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
          <CheckCircle2 size={18} color={COLORS.blue} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: COLORS.text }}>Mode Offline</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
          <Sparkles size={18} color={COLORS.terra} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: COLORS.text }}>Multi-Appareil</span>
        </div>
      </div>

      {/* ── GRAPHIQUE 7 DERNIERS JOURS & VENTES ──────────────── */}
      <div className="responsive-grid auto-fit">
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
          <ResponsiveContainer width="100%" height={180}>
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
      </div>
    </div>
  );
}
