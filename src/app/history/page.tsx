'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight,
  Printer,
  SlidersHorizontal,
  PackageCheck,
  Receipt,
  Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  SearchField,
  Segmented,
  Sheet,
  Skeleton,
} from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { OOS_STATUS_LABELS } from '@/domain/outOfStock';
import { PO_STATUS_LABELS, PO_STATUS_TONES } from '@/domain/purchase';
import { dayLabel, money, dateTime, shortDate } from '@/utils/format';
import { printWith } from '@/client/print';
import Letterhead from '@/components/documents/Letterhead';
import type { HistoryEntry, HistoryKind, OutOfStockStatus, PurchaseOrderStatus } from '@/types';

/**
 * Historique (maquette 9, §24).
 *
 * Le commerçant ne raisonne pas par table : il cherche « ce qui s'est passé
 * mardi ». Ventes, ventes hors stock, commandes et réceptions arrivent donc dans
 * un même flux, groupé par jour, filtrable par nature et par période.
 */

const PERIODS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
];

const KINDS = [
  { value: '', label: 'Tout' },
  { value: 'SALE', label: 'Ventes' },
  { value: 'OUT_OF_STOCK', label: 'Hors stock' },
  { value: 'PURCHASE_ORDER', label: 'Commandes' },
  { value: 'RECEIPT', label: 'Réceptions' },
];

/** Présentation d'une nature d'opération : son icône, son mot, sa destination. */
interface HistoryShape {
  icon: LucideIcon;
  label: string;
  /** `null` pour une réception : elle n'a pas d'écran propre. */
  href: ((entry: HistoryEntry) => string) | null;
}

/**
 * Le titre du document imprimé, par nature d'opération (§55).
 *
 * Distinct du libellé d'une ligne : « Vente » nomme une opération, « Historique
 * des ventes » nomme une pièce. Un en-tête de feuille au singulier se lirait
 * comme une facture.
 */
const TITRES: Record<string, string> = {
  SALE: 'HISTORIQUE DES VENTES',
  OUT_OF_STOCK: 'HISTORIQUE DES VENTES HORS STOCK',
  PURCHASE_ORDER: 'HISTORIQUE DES COMMANDES',
  RECEIPT: 'HISTORIQUE DES RÉCEPTIONS',
};

const SHAPES: Record<HistoryKind, HistoryShape> = {
  SALE: { icon: Receipt, label: 'Vente', href: (entry) => `/sales/${entry.id}` },
  OUT_OF_STOCK: {
    icon: ArrowLeftRight,
    label: 'Hors stock',
    href: (entry) => `/out-of-stock/${entry.id}`,
  },
  PURCHASE_ORDER: { icon: Truck, label: 'Commande', href: (entry) => `/purchases/${entry.id}` },
  RECEIPT: { icon: PackageCheck, label: 'Réception', href: null },
};

/** Badge adapté à la nature de l'opération : chaque flux a ses propres statuts. */
function statusBadge(entry: HistoryEntry) {
  if (entry.kind === 'SALE') {
    if (entry.status === 'CANCELLED') return <Badge tone="red">Annulée</Badge>;
    // Le commerçant lit d'abord « est-ce que j'ai été payé ». Une vente réglée
    // porte donc « Payée », comme sur la maquette ; un reste dû reste visible
    // plutôt que masqué derrière un « Validée » rassurant mais muet.
    if (entry.payment_status === 'PAID') return <Badge tone="green">Payée</Badge>;
    if (entry.payment_status === 'PARTIAL') return <Badge tone="amber">Partielle</Badge>;
    return <Badge tone="amber">Impayée</Badge>;
  }
  if (entry.kind === 'OUT_OF_STOCK') {
    return (
      <Badge
        tone={
          entry.status === 'COMPLETED' ? 'green' : entry.status === 'CANCELLED' ? 'grey' : 'amber'
        }
      >
        {OOS_STATUS_LABELS[entry.status as OutOfStockStatus]}
      </Badge>
    );
  }
  if (entry.kind === 'PURCHASE_ORDER') {
    return (
      <Badge tone={PO_STATUS_TONES[entry.status as PurchaseOrderStatus]}>
        {PO_STATUS_LABELS[entry.status as PurchaseOrderStatus]}
      </Badge>
    );
  }
  return <Badge tone="green">Reçue</Badge>;
}

function HistoryView() {
  const params = useSearchParams();
  const { business, currency } = useSession();
  const [period, setPeriod] = useState('all');
  // La nature vient de l'URL : /sales redirige ici en pré-filtrant sur les ventes.
  const [kind, setKind] = useState(params.get('kind') || 'SALE');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data, loading, error } = useResource<HistoryEntry[]>('/api/history', {
    period,
    kind,
    search,
  });

  // Le total ne vaut que si toutes les lignes sont de même nature : sans
  // filtre, l'historique mêle ventes, commandes et réceptions.
  const total =
    kind && data && data.length > 0
      ? data.reduce((somme, entry) => somme + entry.amount, 0)
      : null;

  // Le regroupement par jour est fait à l'affichage : le serveur renvoie un flux
  // trié, et découper ici évite une seconde requête par journée affichée.
  const days: { label: string; date: string; entries: HistoryEntry[] }[] = [];
  (data || []).forEach((entry) => {
    const label = dayLabel(entry.created_at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else days.push({ label, date: shortDate(entry.created_at), entries: [entry] });
  });

  return (
    <>
      <AppBar back="/more" title="Historique des ventes" />

      <main className="page page--history">
        {/* Même en-tête que la facture (§56). */}
        <div className="print-only doc">
          <div className="doc__head">
            <Letterhead business={business} />
            <div className="doc__piece">
              <h2 className="invoice__title">{TITRES[kind] ?? 'HISTORIQUE DES OPÉRATIONS'}</h2>
              <dl className="doc__champs">
                <dt>Période</dt>
                <dd>{PERIODS.find((une) => une.value === period)?.label ?? 'Tout'}</dd>
                <dt>Édité le</dt>
                <dd>{shortDate(new Date().toISOString())}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="filter-row">
          <SearchField value={search} onChange={setSearch} placeholder="Rechercher une vente…" />
          <button
            type="button"
            className="filter-toggle"
            aria-label="Filtrer l’historique"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal size={21} />
          </button>
        </div>
        <Sheet
          open={filtersOpen}
          title="Filtrer l’historique"
          onClose={() => setFiltersOpen(false)}
        >
          <span className="field__label">Période</span>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <span className="field__label">Type d’opération</span>
          <Segmented options={KINDS} value={kind} onChange={setKind} />
          <button type="button" className="btn" onClick={() => setFiltersOpen(false)}>
            Afficher les résultats
          </button>
        </Sheet>

        {data && data.length > 0 ? (
          <div className="exports-row no-print">
            <Button
              variant="soft"
              size="sm"
              onClick={() => printWith('A4')}
              title="Choisissez Enregistrer au format PDF dans la fenêtre d’impression"
            >
              <Printer size={16} />
              Imprimer / PDF
            </Button>
          </div>
        ) : null}

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={5} height={64} /> : null}

        {data && data.length === 0 ? (
          <Card>
            <Empty
              icon={<Receipt size={26} className="muted" />}
              title="Aucune opération"
              hint="Élargissez la période ou changez de filtre."
            />
          </Card>
        ) : null}

        {days.map((day) => (
          <div key={day.label} className="stack" style={{ gap: 8 }}>
            {/* Le groupe était calculé mais son titre n'était rendu nulle part :
              à l'écran on devinait la journée en lisant les heures, sur une
              feuille imprimée on ne la devinait plus du tout (§55). */}
            <h2 className="history__jour">
              {day.label}
              {/* « Hier » ne veut plus rien dire dans une pochette trois
                semaines plus tard : la date absolue accompagne le libellé
                relatif, à l'écran comme sur la feuille (§55). */}
              {day.label === day.date ? null : (
                <span className="muted"> · {day.date}</span>
              )}
            </h2>
            <Card>
              <div className="list">
                {day.entries.map((entry) => {
                  const shape = SHAPES[entry.kind];
                  const href = shape.href?.(entry);
                  const body = (
                    <>
                      <div className="list__body">
                        <div className="list__title">#{entry.reference}</div>
                        <div className="list__sub">{dateTime(entry.created_at)}</div>
                        <div className="list__sub">
                          {entry.party || (entry.kind === 'SALE' ? 'Client comptoir' : shape.label)}
                        </div>
                      </div>
                      <div className="list__end">
                        <strong className="num">{money(entry.amount, currency)}</strong>
                        {statusBadge(entry)}
                      </div>
                    </>
                  );

                  // Une réception n'ouvre aucun écran : sa ligne reste un bloc
                  // simple plutôt qu'un lien qui ne mènerait nulle part.
                  const key = `${entry.kind}-${entry.id}`;
                  return href ? (
                    <Link key={key} href={href} className="list__row">
                      {body}
                    </Link>
                  ) : (
                    <div key={key} className="list__row">
                      {body}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        ))}

        {/* Un total n'a de sens que sur une nature unique : additionner une
          vente, une commande fournisseur et une réception donnerait un chiffre
          que rien ne désigne (§55). */}
        {total !== null ? (
          <Card pad>
            <div className="total-line total-line--grand">
              <span>Total — {SHAPES[kind as HistoryKind]?.label ?? ''}</span>
              <strong className="num">{money(total, currency)}</strong>
            </div>
            <p className="small muted">{(data || []).length} opération(s) sur la période.</p>
          </Card>
        ) : null}
      </main>
    </>
  );
}

export default function HistoryPage() {
  // useSearchParams suspend au premier rendu : la limite est posée ici pour que
  // la lecture de l'URL ne fasse pas disparaître le reste de la page.
  return (
    <Suspense fallback={<Skeleton count={5} height={64} />}>
      <HistoryView />
    </Suspense>
  );
}
