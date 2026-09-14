'use client';

import Link from 'next/link';
import {
  ArrowLeftRight,
  ChevronRight,
  History,
  LogOut,
  Settings,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Card } from '@/components/ui';
import { useSession } from '@/client/session';

/**
 * Menu « Plus » (maquette 10).
 *
 * Tout ce qui n'a pas sa place dans la barre d'onglets : on n'y va pas pendant
 * qu'un client attend au comptoir.
 */

const LINKS = [
  { href: '/history', label: 'Historique', icon: History },
  { href: '/out-of-stock', label: 'Ventes hors stock', icon: ArrowLeftRight },
  { href: '/customers', label: 'Clients', icon: Users },
  { href: '/suppliers', label: 'Fournisseurs', icon: Truck },
  // L'équipe ne concerne que le propriétaire : l'entrée ne s'affiche pas pour
  // un vendeur, qui n'a rien à y faire.
  { href: '/team', label: 'Équipe', icon: UserCog, ownerOnly: true },
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

export default function MorePage() {
  const { user, business, role, isOwner, signOut } = useSession();

  return (
    <>
      <AppBar brand title="Plus" />

      <main className="page">
        <Card>
          <div className="list__row">
            <span
              className="thumb"
              style={{
                background: 'var(--blue-soft)',
                borderColor: 'transparent',
                color: 'var(--blue-dark)',
                fontWeight: 800,
                fontSize: 18,
              }}
              aria-hidden="true"
            >
              {(user?.name || '?').charAt(0).toUpperCase()}
            </span>
            <div className="list__body">
              <div className="list__title">{user?.name}</div>
              <div className="list__sub">{user?.email}</div>
            </div>
            <span className="badge badge--blue">
              {role === 'OWNER' ? 'Propriétaire' : 'Vendeur'}
            </span>
          </div>
        </Card>

        <Card>
          <div className="list">
            {LINKS.filter((link) => !link.ownerOnly || isOwner).map(
              ({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="list__row">
                  <Icon size={19} className="muted" />
                  <div className="list__body">
                    <div className="list__title">{label}</div>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </Link>
              )
            )}
          </div>
        </Card>

        <Card>
          <button
            type="button"
            className="list__row"
            style={{ color: 'var(--red)' }}
            onClick={signOut}
          >
            <LogOut size={19} />
            <div className="list__body">
              <div className="list__title">Se déconnecter</div>
            </div>
          </button>
        </Card>

        <p className="small muted" style={{ textAlign: 'center' }}>
          QuincaFlow · {business?.name}
        </p>
      </main>
    </>
  );
}
