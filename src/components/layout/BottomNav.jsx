'use client';

import React from 'react';
import Link from 'next/link';
import {
  Home,
  Package,
  ShoppingCart,
  BarChart2,
  Settings,
} from 'lucide-react';
import { COLORS } from '../../constants/theme';

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Accueil' },
  { path: '/stock', icon: Package, label: 'Stock' },
  { path: '/caisse', icon: ShoppingCart, label: 'Caisse' },
  { path: '/comptabilite', icon: BarChart2, label: 'Rapports' },
  { path: '/parametres', icon: Settings, label: 'Réglages' },
];

export default function BottomNav({ currentPath }) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '68px',
        background: 'rgba(26, 16, 8, 0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 1000,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
        const isActive = path === '/' ? currentPath === '/' : currentPath.startsWith(path);

        return (
          <Link
            key={path}
            href={path}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              textDecoration: 'none',
              height: '100%',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '28px',
                borderRadius: '14px',
                background: isActive ? 'rgba(245, 166, 35, 0.18)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <Icon
                size={20}
                color={isActive ? COLORS.amber : COLORS.muted}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? COLORS.amber : COLORS.muted,
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
