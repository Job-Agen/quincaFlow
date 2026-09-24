'use client';

import Link from 'next/link';
import { Coins, FileText, ShoppingCart, TrendingUp } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Notice, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { money } from '@/utils/format';

export default function ReportsPage() {
  const { data, loading, error } = useResource('/api/dashboard');
  const { currency } = useSession();
  const metrics = [
    ['Ventes du jour', 'revenue', TrendingUp, 'green'],
    ['Achats du jour', 'purchasesToday', ShoppingCart, 'blue'],
    ['Marge estimée', 'margin', Coins, 'amber'],
    ['Nombre de ventes', 'salesCount', FileText, 'violet'],
  ];
  return (
    <>
      <AppBar back="/more" title="Rapports" />
      <main className="page">
        <div>
          <h2 className="section-title">Votre activité du jour</h2>
          <p className="small muted">
            Les montants proviennent des opérations enregistrées aujourd’hui.
          </p>
        </div>
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={2} height={110} /> : null}
        {data ? (
          <>
            <div className="tiles">
              {metrics.map(([label, key, Icon, tone]) => (
                <div className={'tile tile--' + tone} key={key}>
                  <span className="tile__label">
                    {label}
                    <Icon size={24} />
                  </span>
                  <strong className="tile__value">
                    {Number(data[key] || 0).toLocaleString('fr-FR')}
                  </strong>
                  {key !== 'salesCount' ? <span className="tile__unit">{currency}</span> : null}
                </div>
              ))}
            </div>
            <div className="total-line">
              <span>Panier moyen</span>
              <strong>
                {money(data.salesCount ? data.revenue / data.salesCount : 0, currency)}
              </strong>
            </div>
            <div className="total-line">
              <span>Produits en stock faible</span>
              <Link className="link" href="/products?filter=low">
                {data.lowStockCount} · Consulter
              </Link>
            </div>
          </>
        ) : null}
        <Link href="/history" className="btn btn--soft">
          Consulter l’historique
        </Link>
      </main>
    </>
  );
}
