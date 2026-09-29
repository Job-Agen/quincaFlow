'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, ShoppingCart, Gift, History, Receipt, Menu, Store, WifiOff } from 'lucide-react';
import { useSession } from '@/client/session';
import type { ReactNode } from 'react';

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

const PUBLIC_ROUTES = ['/login', '/register'];

/** Les six destinations du §6, dans son ordre. */
const TABS = [
  { href: '/dashboard', label: 'Accueil', icon: Home },
  { href: '/sales/new', label: 'Vendre', icon: Receipt },
  { href: '/products', label: 'Produits', icon: Gift },
  { href: '/purchases', label: 'Achats', icon: ShoppingCart },
  { href: '/history', label: 'Historique', icon: History },
  { href: '/more', label: 'Plus', icon: Menu },
];

/** L'onglet actif est le préfixe le plus long : /products/new allume Produits. */
function activeHref(pathname: string): string {
  const matches = TABS.filter(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  );
  const best = matches.reduce<(typeof TABS)[number] | null>(
    (kept, tab) => (!kept || tab.href.length > kept.href.length ? tab : kept),
    null
  );
  if (best) return best.href;
  // Une vente ouverte reste rattachée à « Vendre » ; tout le reste vit sous « Plus ».
  return pathname.startsWith('/sales/') ? '/sales/new' : '/more';
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, reload } = useSession();

  // Connexion et inscription occupent tout l'écran, et n'attendent aucune session.
  if (PUBLIC_ROUTES.includes(pathname)) return children;

  // Le serveur est injoignable : on le dit, et on n'affiche rien d'autre. Pas de
  // chiffre venu du cache, pas de renvoi vers la connexion — la session du gérant
  // est valide, c'est le réseau qui manque (§38).
  if (status === 'unreachable') return <Unreachable onRetry={reload} />;

  // Tant que la session n'est pas connue, les écrans protégés ne sont pas montés.
  // Les monter d'abord leur ferait lancer des requêtes vouées au 401, puis les
  // relancer une fois la session établie — deux fois le réseau pour rien, sur
  // précisément le type de connexion que QuincaFlow doit ménager.
  if (status !== 'authenticated') return <Splash />;

  const active = activeHref(pathname);
  const primary = ['/dashboard', '/purchases', '/history', '/more'].includes(pathname);

  return (
    <div className={`shell shell--nav${primary ? '' : ' shell--detail'}`}>
      {children}
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="tabbar__item"
            data-active={href === active}
            aria-current={href === active ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={href === active ? 2.4 : 1.9} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Chargement">
      <Store size={30} />
      <span>MaQuincaillerie</span>
    </div>
  );
}

/** Écran de coupure : ce que le gérant voit quand le serveur ne répond pas. */
function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="splash splash--offline" role="alert">
      <WifiOff size={30} />
      <strong>Pas de connexion</strong>
      <span className="small muted">
        Vos chiffres ne peuvent pas être affichés tant que le serveur est injoignable. Rien n’est
        perdu : reconnectez-vous au réseau puis réessayez.
      </span>
      <button type="button" className="btn btn--sm" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
