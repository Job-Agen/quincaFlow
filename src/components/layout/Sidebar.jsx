'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingDown,
  BarChart2,
  Users,
  FileText,
  HandCoins,
  Truck,
  Settings,
  LogOut,
} from 'lucide-react';
import { COLORS, FONTS, Z } from '../../constants/theme';
import useSettings from '../../hooks/useSettings';
import { useSession } from '../auth/SyncGate';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { path: '/stock', icon: Package, label: 'Stock' },
  { path: '/caisse', icon: ShoppingCart, label: 'Caisse' },
  { path: '/achats', icon: Truck, label: 'Achats' },
  { path: '/credits', icon: HandCoins, label: 'Crédits' },
  { path: '/depenses', icon: TrendingDown, label: 'Dépenses' },
  { path: '/comptabilite', icon: BarChart2, label: 'Comptabilité' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/facturation', icon: FileText, label: 'Facturation' },
  { path: '/parametres', icon: Settings, label: 'Paramètres' },
];

/**
 * Full sidebar for desktop (230px) or compact icon-only sidebar for tablet (60px).
 */
export default function Sidebar({ currentPath, compact = false }) {
  const sidebarWidth = compact ? '60px' : '230px';
  const { settings } = useSettings();
  const { user, configured, signOut } = useSession();
  const initials = (settings.storeName || 'Ma Boutique')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: sidebarWidth,
        height: '100vh',
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: Z.sidebar,
        overflowY: 'auto',
        transition: 'width 0.2s ease',
      }}
    >
      <div style={{ padding: compact ? '18px 0 14px' : '24px 20px 20px', textAlign: compact ? 'center' : 'left' }}>
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: compact ? '16px' : '20px',
            fontWeight: 800,
            color: COLORS.amber,
            letterSpacing: '-0.5px',
          }}
        >
          {compact ? initials : settings.storeName}
        </div>
        {!compact && (
          <div
            style={{
              fontSize: '11px',
              color: COLORS.muted,
              marginTop: '3px',
              fontFamily: FONTS.body,
            }}
          >
            {settings.tagline}
          </div>
        )}
      </div>

      <div style={{ height: '1px', background: COLORS.border, margin: compact ? '0 8px' : '0 16px' }} />

      <nav style={{ padding: '12px 0', flex: 1 }}>
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/' ? currentPath === '/' : currentPath.startsWith(path);

          return (
            <Link
              key={path}
              href={path}
              title={compact ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: compact ? 'center' : 'flex-start',
                gap: compact ? '0' : '10px',
                padding: compact ? '12px 0' : '10px 20px',
                textDecoration: 'none',
                color: isActive ? COLORS.amber : COLORS.muted,
                fontFamily: FONTS.body,
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? `${COLORS.amber}15` : 'transparent',
                borderLeft: isActive ? `3px solid ${COLORS.amber}` : '3px solid transparent',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              <Icon size={compact ? 20 : 18} strokeWidth={isActive ? 2.5 : 2} />
              {!compact && label}
            </Link>
          );
        })}
      </nav>

      {configured && user && (
        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            padding: compact ? '12px 0' : '12px 16px',
          }}
        >
          {!compact && (
            <div
              style={{
                fontSize: '11px',
                color: COLORS.muted,
                fontFamily: FONTS.body,
                marginBottom: '8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={user.email}
            >
              {user.email}
            </div>
          )}
          <button
            type="button"
            onClick={signOut}
            title="Se déconnecter"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: compact ? 'center' : 'flex-start',
              gap: compact ? 0 : '8px',
              width: '100%',
              padding: compact ? '10px 0' : '8px 10px',
              background: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              color: COLORS.muted,
              cursor: 'pointer',
              fontFamily: FONTS.body,
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <LogOut size={16} strokeWidth={2} />
            {!compact && 'Se déconnecter'}
          </button>
        </div>
      )}
    </div>
  );
}
