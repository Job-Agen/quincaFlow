'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Coins,
  Info,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Card, CardHead, Empty, Notice, Segmented, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { EXPENSE_CATEGORY_LABELS, isOperating } from '@/domain/report';
import ExpenseDonut from '@/components/reports/ExpenseDonut';
import { amount, money, monthLabel, percent, quantity, shortDate, withUnit } from '@/utils/format';
import type { FinancialReport, ProductProfit } from '@/types';

/**
 * Rapports financiers & marges (§39).
 *
 * Le tableau de bord (§8) répond à « qu'est-ce qui s'est passé aujourd'hui ? ».
 * Cet écran répond à « qu'est-ce que ce mois m'a réellement rapporté ? », et il
 * va jusqu'au bénéfice net — ce que la marge brute n'est pas.
 *
 * Deux exigences le gouvernent. La première : les lignes doivent reconstituer
 * leur total, sinon aucun chiffre de l'écran n'est plus crédible. La seconde :
 * dire ce que le chiffre vaut. Un bénéfice net calculé sans aucune dépense
 * saisie est une marge brute, et l'écran le dit au lieu de laisser croire.
 */

const PERIODS = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last-month', label: 'Mois dernier' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
];

/** Tris proposés sur la rentabilité produit : ce que le gérant vient chercher. */
const SORTS = [
  { value: 'margin', label: 'Marge' },
  { value: 'revenue', label: 'Ventes' },
  { value: 'rate', label: 'Taux' },
];

function sortProducts(products: ProductProfit[], by: string): ProductProfit[] {
  const copy = [...products];
  if (by === 'revenue') return copy.sort((a, b) => b.revenue - a.revenue);
  // Un produit sans chiffre d'affaires n'a pas de taux : il part en fin de liste
  // plutôt qu'en tête, où un `null` trié comme zéro le placerait.
  if (by === 'rate') {
    return copy.sort((a, b) => (b.marginRate ?? -Infinity) - (a.marginRate ?? -Infinity));
  }
  return copy.sort((a, b) => b.margin - a.margin);
}

export default function ReportsPage() {
  const { currency, isOwner } = useSession();
  const [period, setPeriod] = useState('month');
  const [sort, setSort] = useState('margin');

  const { data, loading, error } = useResource<FinancialReport>('/api/reports', { period });
  const totals = data?.totals;
  // Le nombre annoncé doit correspondre au montant affiché sur la même ligne :
  // les achats de stock comptent dans la caisse, pas dans les charges.
  const operatingCount = (data?.expensesByCategory || [])
    .filter((bucket) => isOperating(bucket.category))
    .reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <>
      <AppBar
        back="/more"
        title="Rapports financiers"
        right={
          <Link href="/cash" className="appbar__icon" aria-label="Journal de caisse">
            <Wallet size={21} />
          </Link>
        }
      />

      <main className="page page--reports">
        {!isOwner ? (
          <Notice tone="warn">
            Seul le propriétaire consulte les résultats financiers de la boutique.
          </Notice>
        ) : null}

        <Segmented options={PERIODS} value={period} onChange={setPeriod} />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={96} /> : null}

        {data && totals ? (
          <>
            <div className="tiles">
              <Tile
                label="Chiffre d’affaires"
                value={totals.revenue}
                currency={currency}
                tone="green"
                icon={TrendingUp}
              />
              <Tile
                label="Marge brute"
                value={totals.grossMargin}
                currency={currency}
                tone="amber"
                icon={Coins}
              />
              <Tile
                label="Dépenses déduites"
                value={totals.operatingExpenses}
                currency={currency}
                tone="violet"
                icon={Receipt}
              />
              <Tile
                label="Bénéfice net"
                value={totals.netProfit}
                currency={currency}
                // Un résultat négatif change de couleur : c'est le chiffre pour
                // lequel on ouvre cet écran, et il doit se voir sans être lu.
                tone={totals.netProfit < 0 ? 'red' : 'blue'}
                icon={totals.netProfit < 0 ? TrendingDown : Wallet}
              />
            </div>

            <Card pad>
              <CardHead title="Du chiffre d’affaires au bénéfice" />
              <div className="waterfall">
                <div className="total-line">
                  <span>
                    Ventes en boutique
                    <span className="muted small"> · {data.salesCount}</span>
                  </span>
                  <span className="num">{money(totals.salesRevenue, currency)}</span>
                </div>
                <div className="total-line">
                  <span>
                    Ventes hors stock
                    <span className="muted small"> · {data.outOfStockCount}</span>
                  </span>
                  <span className="num">{money(totals.outOfStockRevenue, currency)}</span>
                </div>
                <div className="total-line total-line--sub">
                  <span>Chiffre d’affaires</span>
                  <span className="num">{money(totals.revenue, currency)}</span>
                </div>
                <div className="total-line">
                  <span>Coût des marchandises vendues</span>
                  <span className="num negative">− {money(totals.costOfGoods, currency)}</span>
                </div>
                <div className="total-line total-line--sub">
                  <span>
                    Marge brute
                    <span className="muted small"> · {percent(totals.marginRate)}</span>
                  </span>
                  <span className="num">{money(totals.grossMargin, currency)}</span>
                </div>
                <div className="total-line">
                  <span>
                    Dépenses de fonctionnement
                    <span className="muted small">
                      {' '}
                      · {operatingCount} saisie{operatingCount > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="num negative">
                    − {money(totals.operatingExpenses, currency)}
                  </span>
                </div>
                <div className="total-line total-line--grand">
                  <span>Bénéfice net</span>
                  <span className={`amount num${totals.netProfit < 0 ? ' negative' : ''}`}>
                    {money(totals.netProfit, currency)}
                  </span>
                </div>
              </div>

              {totals.stockPurchases > 0 ? (
                // Le gérant qui a payé 200 000 de ciment ce mois-ci cherchera
                // pourquoi son bénéfice n'a pas bougé : la réponse est ici, pas
                // dans une note de bas de page qu'il n'ouvrira pas.
                <Notice icon={<Info size={17} />}>
                  {money(totals.stockPurchases, currency)} d’achat de stock sont sortis de votre
                  caisse sur la période, sans être déduits ici : la marchandise est comptée à son
                  coût le jour où elle est vendue, et la retirer deux fois ferait apparaître une
                  perte qui n’existe pas.{' '}
                  <Link href="/cash" className="link">
                    Voir le journal de caisse
                  </Link>
                </Notice>
              ) : null}

              {data.expenseCount === 0 ? (
                <Notice tone="warn" icon={<AlertTriangle size={17} />}>
                  Aucune dépense n’est enregistrée sur cette période : le bénéfice net affiché est
                  donc votre marge brute. Transport, salaires, loyer et pertes en seront déduits dès
                  que vous les saisirez.{' '}
                  <Link href="/expenses" className="link">
                    Saisir une dépense
                  </Link>
                </Notice>
              ) : (
                <p className="muted small">
                  Le bénéfice net n’est juste que si toutes les dépenses de la période ont été
                  saisies.{' '}
                  <Link href="/expenses" className="link">
                    Voir les dépenses
                  </Link>
                </p>
              )}
            </Card>

            <Card pad>
              <CardHead
                title="Répartition des dépenses"
                action={
                  <Link href="/expenses" className="link">
                    Saisir
                  </Link>
                }
              />
              {data.expensesByCategory.length === 0 ? (
                <Empty
                  icon={<Receipt size={26} className="muted" />}
                  title="Aucune dépense"
                  hint="Notez transport, salaires, loyer et pertes pour obtenir un bénéfice réel."
                />
              ) : (
                <>
                  <ExpenseDonut
                    buckets={data.expensesByCategory}
                    total={totals.expenses}
                    currency={currency}
                  />
                  <div className="waterfall">
                    <div className="total-line total-line--sub">
                      <span>Total sorti de caisse</span>
                      <span className="num">{money(totals.expenses, currency)}</span>
                    </div>
                  </div>
                </>
              )}
            </Card>

            <Card pad>
              <CardHead
                title={data.granularity === 'day' ? 'Ventes par jour' : 'Ventes par mois'}
              />
              {data.buckets.length === 0 ? (
                <Empty title="Aucune vente sur la période" hint="Changez de période." />
              ) : (
                <div className="list">
                  {data.buckets.map((bucket) => {
                    const operations = bucket.salesCount + bucket.outOfStockCount;
                    return (
                      <div key={bucket.bucket} className="list__row">
                        <div className="list__body">
                          <div className="list__title">
                            {data.granularity === 'day'
                              ? shortDate(bucket.bucket)
                              : monthLabel(bucket.bucket)}
                          </div>
                          <div className="list__sub">
                            {operations} opération{operations > 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="list__end">
                          <strong className="num">{money(bucket.revenue, currency)}</strong>
                          <span className="muted small num">
                            marge {money(bucket.margin, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card pad>
              <CardHead title="Rentabilité par produit" />
              {data.products.length === 0 ? (
                <Empty
                  title="Aucun produit vendu"
                  hint="La rentabilité se calcule à partir des ventes de la période."
                />
              ) : (
                <>
                  <Segmented options={SORTS} value={sort} onChange={setSort} />
                  <div className="list">
                    {sortProducts(data.products, sort).map((product) => (
                      <div
                        key={`${product.productId ?? 'x'}-${product.productName}`}
                        className="list__row"
                      >
                        <div className="list__body">
                          <div className="list__title">{product.productName}</div>
                          <div className="list__sub">
                            {product.quantity > 0
                              ? `Quantité vendue : ${withUnit(product.quantity, product.baseUnit)}`
                              : 'Vendu hors stock uniquement'}
                            {product.outOfStockQuantity > 0 && product.quantity > 0
                              ? ` · ${quantity(product.outOfStockQuantity)} hors stock`
                              : ''}
                          </div>
                          <div className="list__sub">
                            Ventes {money(product.revenue, currency)} · coût{' '}
                            {money(product.cost, currency)}
                          </div>
                        </div>
                        <div className="list__end">
                          <strong className={`num${product.margin < 0 ? ' negative' : ''}`}>
                            {money(product.margin, currency)}
                          </strong>
                          <span className="muted small num">{percent(product.marginRate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {data.productCount > data.products.length ? (
                    <p className="muted small">
                      {data.products.length} produits affichés sur {data.productCount}, les plus
                      gros chiffres d’affaires d’abord.
                    </p>
                  ) : null}
                </>
              )}
            </Card>
          </>
        ) : null}
      </main>
    </>
  );
}

/** Tuile du haut : la même présentation que le tableau de bord (§8). */
function Tile({
  label,
  value,
  currency,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  currency: string;
  tone: 'green' | 'blue' | 'amber' | 'violet' | 'red';
  icon: LucideIcon;
}) {
  return (
    <div className={`tile tile--${tone}`}>
      <span className="tile__label">
        {label}
        <Icon size={16} />
      </span>
      <span className="tile__value num">{amount(value, 0)}</span>
      <span className="tile__unit">{currency}</span>
    </div>
  );
}
