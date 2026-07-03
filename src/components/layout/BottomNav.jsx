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
} from 'lucide-react';
import { COLORS } from '../../constants/theme';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Accueil' },
  { path: '/stock', icon: Package, label: 'Stock' },
  { path: '/caisse', icon: ShoppingCart, label: 'Caisse' },
  { path: '/depenses', icon: TrendingDown, label: 'Dépenses' },
  { path: '/comptabilite', icon: BarChart2, label: 'Compta' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/facturation', icon: FileText, label: 'Factures' },
];

export default function BottomNav({ currentPath }) {
  return (
    <div
      className="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: COLORS.card,
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        zIndex: 100,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
        const isActive = path === '/' ? currentPath === '/' : currentPath.startsWith(path);

        return (
          <Link
            key={path}
            href={path}
            style={{
              flex: '1 0 auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              minWidth: '48px',
              padding: '8px 4px 6px',
              color: isActive ? COLORS.amber : COLORS.muted,
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span
              style={{
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
