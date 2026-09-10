'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronRight,
  Coins,
  FileText,
  ShoppingCart,
  Store,
  TrendingUp,
} from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Card, CardHead, Empty, Notice, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { money, quantity, time } from '@/utils/format';

/**
 * Tableau de bord (maquette 2, §8).
 *
 * Il répond à une seule question : « que s'est-il passé dans ma boutique
 * aujourd'hui ? ». Pas de graphique, pas d'analyse — six chiffres, les alertes
 * de stock, et les dernières opérations.
 */

const TILES = [
  { key: 'revenue', label: 'Ventes du jour', tone: 'green', icon: TrendingUp, money: true },
  { key: 'purchasesToday', label: 'Achats du jour', tone: 'blue', icon: ShoppingCart, money: true },
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
    key: 'lowStockCount',
    label: 'Produits en stock faible',
    tone: 'amber',
    icon: AlertTriangle,
    href: '/products?filter=low',
  },
];

export default function DashboardPage() {
  const { business, user, currency } = useSession();
  const { data, loading, error } = useResource('/api/dashboard');

  return (
    <>
      <AppBar
        brand
        title={business?.name || 'Ma quincaillerie'}
        left={
          <span className="appbar__icon" aria-hidden="true">
            <Store size={20} />
          </span>
        }
      />

      <main className="page">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>
            Bonjour{user?.name ? ` ${user.name.split(' ')[0]}` : ''} !
          </h2>
          <p className="muted small">Voici un aperçu de votre activité aujourd&apos;hui.</p>
        </div>

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={2} height={96} /> : null}

        {data ? (
          <>
            <div className="tiles">
              {TILES.map(({ key, label, tone, icon: Icon, money: isMoney, href }) => {
                // Une tuile cliquable est un vrai lien, pas un bloc habillé en
                // lien : c'est ce qui la rend atteignable au clavier et annoncée
                // comme telle par un lecteur d'écran.
                const Tag = href ? Link : 'div';
                return (
                  <Tag key={key} href={href} className={`tile tile--${tone}`}>
                    <span className="tile__label">
                      {label}
                      <Icon size={16} />
                    </span>
                    <span className="tile__value num">
                      {isMoney ? Number(data[key]).toLocaleString('fr-FR') : data[key]}
                    </span>
                    {isMoney ? <span className="tile__unit">{currency}</span> : null}
                  </Tag>
                );
              })}
            </div>

            <Card>
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
                            : `Il reste ${quantity(product.stock_quantity)} ${product.base_unit}`}
                        </div>
                      </div>
                      <ChevronRight size={18} className="muted" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHead
                title="Activité récente"
                action={
                  <Link href="/history" className="link">
                    Historique
                  </Link>
                }
              />
              {data.activity.length === 0 ? (
                <Empty
                  title="Rien pour le moment"
                  hint="Vos ventes apparaîtront ici dès la première opération."
                />
              ) : (
                <div className="list">
                  {data.activity.map((entry) => (
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
                      <strong className="num">{money(entry.total, currency)}</strong>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}
      </main>
    </>
  );
}
