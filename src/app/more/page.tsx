'use client';

import Link from 'next/link';
import {
  ArrowLeftRight,
  ChevronRight,
  LogOut,
  Settings,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { useSession } from '@/client/session';

interface MoreLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Réservé au propriétaire (§5). */
  ownerOnly?: boolean;
}

/**
 * Entrées de « Plus », dans l'ordre du §6 : Clients, Fournisseurs, Paramètres,
 * Déconnexion.
 *
 * Deux ajouts assumés au-delà de cette liste. « Ventes hors stock » donne accès
 * à l'écran du §16, que le PRD décrit mais ne rattache à aucune navigation.
 * « Équipe » crée les comptes vendeurs : sans elle, le rôle SELLER du §5
 * existerait dans le modèle sans aucun moyen de l'attribuer.
 */
const LINKS: readonly MoreLink[] = [
  { href: '/customers', label: 'Clients', icon: Users },
  { href: '/suppliers', label: 'Fournisseurs', icon: Truck },
  { href: '/settings', label: 'Paramètres', icon: Settings },
  { href: '/out-of-stock', label: 'Ventes hors stock', icon: ArrowLeftRight },
  { href: '/team', label: 'Équipe', icon: UserCog, ownerOnly: true },
];

export default function MorePage() {
  const { user, isOwner, signOut } = useSession();
  return (
    <>
      <AppBar brand title="Plus" />
      <main className="page page--more">
        <Link href="/settings" className="list__row profile-row">
          <span className="avatar" aria-hidden="true">
            {(user?.name || 'A').charAt(0).toUpperCase()}
          </span>
          <div className="list__body">
            <div className="list__title">{user?.name}</div>
            <div className="list__sub">{user?.email}</div>
          </div>
          <ChevronRight size={19} className="muted" />
        </Link>
        <div className="list">
          {LINKS.filter((item) => !item.ownerOnly || isOwner).map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href} className="list__row">
              <Icon size={21} />
              <span className="list__body">{label}</span>
              <ChevronRight size={19} className="muted" />
            </Link>
          ))}
          <button type="button" className="list__row" onClick={signOut}>
            <LogOut size={21} />
            <span className="list__body">Se déconnecter</span>
          </button>
        </div>
      </main>
    </>
  );
}
