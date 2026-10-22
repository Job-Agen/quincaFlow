'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  ChevronRight,
  Coins,
  FileText,
  HandCoins,
  Store,
  TrendingUp,
  Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Card, CardHead, Empty, Notice, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import SemaineChart from '@/components/dashboard/SemaineChart';
import { amount, money, quantity, time, withUnit } from '@/utils/format';
import type { DashboardSummary } from '@/types';

/**
 * Tableau de bord (§8).
 *
 * Il répond à une seule question : « que s'est-il passé dans ma boutique
 * aujourd'hui ? ». Pas de graphique, pas d'analyse — les cinq chiffres du PRD,
 * les alertes de stock, et les dernières opérations.
 */

/** Une tuile lit un champ du résumé et sait comment l'afficher. */
interface Tile {
  key: keyof DashboardSummary;
  label: string;
  tone: 'green' | 'blue' | 'amber' | 'violet';
  icon: LucideIcon;
  /** Vrai : le nombre est un montant, et porte la devise sous sa valeur. */
  money?: boolean;
  /** Une tuile qui mène quelque part devient un lien. */
  href?: string;
  /** Vrai : la tuile révèle des prix d'achat, et n'est pas pour un vendeur (§5). */
  ownerOnly?: boolean;
}

/**
 * Les cinq indicateurs du §8, dans son ordre.
 *
 * « Achats du jour » n'y figure pas : le PRD demande ventes, marge, nombre de
 * ventes, ventes hors stock et produits en stock faible.
 */
const TILES: readonly Tile[] = [
  { key: 'revenue', label: 'Ventes du jour', tone: 'green', icon: TrendingUp, money: true },
  { key: 'margin', label: 'Marge brute estimée', tone: 'amber', icon: Coins, money: true },
  { key: 'salesCount', label: 'Nombre de ventes', tone: 'violet', icon: FileText },
  {
    key: 'outOfStockCount',
    label: 'Ventes hors stock',
    tone: 'blue',
    icon: ArrowLeftRight,
    href: '/out-of-stock',
  },
  {
    key: 'receivables',
    label: 'Créances clients',
    tone: 'amber',
    icon: HandCoins,
    money: true,
    href: '/customers',
  },
  {
    key: 'supplierDebt',
    label: 'Dettes fournisseurs',
    tone: 'violet',
    icon: Truck,
    money: true,
    href: '/purchases',
    ownerOnly: true,
  },
  {
    key: 'lowStockCount',
    label: 'Produits en stock faible',
    tone: 'amber',
    icon: AlertTriangle,
    href: '/products?filter=low',
  },
];

export default function DashboardPage() {
  const { business, currency, isOwner } = useSession();
  const { data, loading, error } = useResource<DashboardSummary>('/api/dashboard');

  return (
    <>
      <AppBar
        brand
        title={business?.name || 'MaQuincaillerie'}
        right={
          <Link
            href="/products?filter=low"
            className="appbar__icon notification"
            aria-label="Alertes de stock"
          >
            <Bell size={22} />
            {(data?.lowStockCount ?? 0) > 0 ? <i /> : null}
          </Link>
        }
        left={
          <span className="appbar__icon" aria-hidden="true">
            <Store size={20} />
          </span>
        }
      />

      <main className="page page--dashboard">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Bonjour !</h2>
          <p className="muted small">Voici un aperçu de votre activité aujourd&apos;hui.</p>
        </div>

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={2} height={96} /> : null}

        {data ? (
          <>
            <div className="tiles">
              {TILES.filter((tile) => isOwner || !tile.ownerOnly).map(
                ({ key, label, tone, icon: Icon, money: isMoney, href }) => {
                  // Une tuile cliquable est un vrai lien, pas un bloc habillé en
                  // lien : c'est ce qui la rend atteignable au clavier et annoncée
                  // comme telle par un lecteur d'écran.
                  const value = data[key];
                  const body = (
                    <>
                      <span className="tile__label">
                        {label}
                        <Icon size={16} />
                      </span>
                      <span className="tile__value num">
                        {isMoney ? amount(value, 0) : String(value)}
                      </span>
                      {isMoney ? <span className="tile__unit">{currency}</span> : null}
                    </>
                  );
                  const className = `tile tile--${tone}`;
                  return href ? (
                    <Link key={key} href={href} className={className}>
                      {body}
                    </Link>
                  ) : (
                    <div key={key} className={className}>
                      {body}
                    </div>
                  );
                }
              )}
            </div>

            {/* La semaine, puis le palmarès : « est-ce que ça monte ? » et
              « qu'est-ce qui fait vivre la boutique ? » (§49). */}
            <Card pad className="stack" style={{ gap: 12 }}>
              <CardHead title="Cette semaine" />
              <SemaineChart week={data.week} currency={currency} />
            </Card>

            {data.topProducts.length > 0 ? (
              <Card>
                <CardHead title="Les plus vendus cette semaine" />
                <ol className="palmares">
                  {data.topProducts.map((produit, rang) => (
                    <li key={produit.name}>
                      <span className="palmares__rang" aria-hidden="true">
                        {rang + 1}
                      </span>
                      <span className="palmares__corps">
                        <strong>{produit.name}</strong>
                        <span className="small muted">
                          {quantity(produit.quantity)} vendu{produit.quantity > 1 ? 's' : ''}
                        </span>
                      </span>
                      <strong className="num">{money(produit.revenue, currency)}</strong>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : null}

            <Card className="stock-alerts">
              <CardHead
                title="Stock faible"
                action={
                  <Link href="/products?filter=low" className="link">
                    Voir tout
                  </Link>
                }
              />
              {data.lowStock.length === 0 ? (
                <Empty title="Aucune alerte" hint="Tous vos produits sont au-dessus du seuil." />
              ) : (
                <div className="list">
                  {data.lowStock.map((product) => (
                    <Link key={product.id} href={`/products/${product.id}`} className="list__row">
                      <span
                        className="thumb"
                        style={{
                          background:
                            product.stock_quantity <= 0 ? 'var(--red-soft)' : 'var(--amber-soft)',
                          borderColor: 'transparent',
                          color: product.stock_quantity <= 0 ? 'var(--red)' : 'var(--amber)',
                        }}
                      >
                        <AlertTriangle size={20} />
                      </span>
                      <div className="list__body">
                        <div className="list__title">{product.name}</div>
                        <div className="list__sub">
                          {product.stock_quantity <= 0
                            ? 'Rupture de stock'
                            : `Il reste ${withUnit(product.stock_quantity, product.base_unit)}`}
                        </div>
                      </div>
                      <ChevronRight size={18} className="muted" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            {data.recent.length > 0 ? (
              <Card className="recent-activity">
                <CardHead
                  title="Activité récente"
                  action={
                    <Link href="/history" className="link">
                      Historique
                    </Link>
                  }
                />
                {data.recent.length === 0 ? (
                  <Empty
                    title="Rien pour le moment"
                    hint="Vos ventes apparaîtront ici dès la première opération."
                  />
                ) : (
                  <div className="list">
                    {data.recent.map((entry) => (
                      <Link
                        key={`${entry.kind}-${entry.id}`}
                        href={
                          entry.kind === 'SALE' ? `/sales/${entry.id}` : `/out-of-stock/${entry.id}`
                        }
                        className="list__row"
                      >
                        <span className="muted small num" style={{ width: 44 }}>
                          {time(entry.created_at)}
                        </span>
                        <div className="list__body">
                          <div className="list__title">
                            {entry.kind === 'SALE' ? 'Vente' : 'Hors stock'} {entry.reference}
                          </div>
                        </div>
                        <strong className="num">{money(entry.amount, currency)}</strong>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            ) : (
              <Link href="/history" className="link dashboard-history">
                Historique des ventes
              </Link>
            )}
          </>
        ) : null}
      </main>
    </>
  );
}
