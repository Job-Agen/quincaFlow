'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, ShoppingCart, Package, Truck, LayoutGrid } from 'lucide-react';
import { useSession } from '@/client/session';

/**
 * Coque de l'application.
 *
 * Les cinq destinations les plus utilisées restent à portée de pouce en
 * permanence (§6, §32) : Accueil, Vendre, Produits, Achats, Plus. Le reste —
 * clients, fournisseurs, paramètres — vit derrière « Plus », car on n'y va pas
 * pendant qu'un client attend au comptoir.
 *
 * À partir de 900 px la même liste devient une colonne latérale : une seule
 * définition de navigation, deux présentations.
 */

const TABS = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/sales/new', label: 'Vendre', icon: ShoppingCart },
  { href: '/products', label: 'Produits', icon: Package },
  { href: '/purchases', label: 'Achats', icon: Truck },
  { href: '/more', label: 'Plus', icon: LayoutGrid },
];

/** L'onglet actif est le préfixe le plus long : /products/new allume Produits. */
function activeHref(pathname) {
  const matches = TABS.filter(
    (tab) => pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href))
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, tab) => (tab.href.length > best.href.length ? tab : best)).href;
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { status } = useSession();

  // Connexion et inscription occupent tout l'écran : ni barre, ni onglets.
  const bare = ['/login', '/register'].includes(pathname) || status !== 'authenticated';
  if (bare) return children;

  const active = activeHref(pathname);

  return (
    <div className="shell shell--nav">
      {children}
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="tabbar__item" data-active={href === active}>
            <Icon size={21} strokeWidth={href === active ? 2.4 : 1.9} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
