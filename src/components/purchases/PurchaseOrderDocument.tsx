'use client';

/**
 * Le bon de commande (§43).
 *
 * L'écran de détail est un poste de travail : statut, réception, pièces
 * jointes. Ce document-ci est ce qui part chez le fournisseur, et c'est
 * pourquoi il vit à part : « Imprimer » ne doit sortir que lui, sans les
 * cartes de suivi, et la feuille qui s'imprime est celle qu'on relit avant
 * d'envoyer.
 *
 * Même chemin que la facture du §15 : du HTML mis en forme pour l'impression,
 * parce que « Imprimer » propose « Enregistrer au format PDF » sur tous les
 * navigateurs mobiles courants. Aucun moteur PDF embarqué, et le document ne
 * transite par aucun serveur.
 *
 * Il est séparé de la route parce qu'une page Next n'accepte aucun export
 * nommé, et parce qu'un test doit pouvoir le monter sans fabriquer la promesse
 * de paramètres que Next lui passe.
 */
import { FileDown, MessageCircle, Printer, Share2, Store } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Button, Notice, Skeleton } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import {
  PO_STATUS_LABELS,
  PO_STATUS_TONES,
  orderMessageLines,
  orderTotal,
  purchaseOrderHeading,
  purchaseOrderMessage,
} from '@/domain/purchase';
import { amount, money, quantity, shortDate } from '@/utils/format';
import { round2 } from '@/utils/money';
import type { PurchaseOrder } from '@/types';

export default function PurchaseOrderDocument({ id }: { id: string }) {
  const { business, currency } = useSession();
  const { data, loading, error } = useResource<PurchaseOrder>(`/api/purchase-orders/${id}`);

  const cancelled = data?.status === 'CANCELLED';
  const lines = data ? orderMessageLines(data.items) : [];
  // Le total est recalculé plutôt que lu : le document doit afficher la somme
  // de ses propres lignes, et c'est elle qui décide du titre (§43).
  const total = orderTotal(
    lines.map((line) => ({ quantity: line.quantity, unitCost: line.unitCost ?? 0 }))
  );
  const priced = total > 0;

  async function share(target: 'native' | 'whatsapp' = 'native') {
    if (!data) return;
    const text = purchaseOrderMessage(
      {
        reference: data.reference,
        supplierName: data.supplier_name,
        createdAt: data.created_at,
        notes: data.notes,
        cancelled,
      },
      lines,
      business,
      currency
    );

    if (target !== 'whatsapp' && navigator.share) {
      await navigator
        .share({ title: `${purchaseOrderHeading(priced)} ${data.reference}`, text })
        .catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
  }

  return (
    <>
      <AppBar
        back={`/purchases/${id}`}
        // La barre dit la même chose que le titre du document : annoncer
        // « Bon de commande » au-dessus d'une « Demande de prix » ferait douter
        // le gérant de ce qu'il s'apprête à envoyer.
        title={data && !priced ? 'Demande de prix' : 'Bon de commande'}
        right={
          data ? (
            <button
              type="button"
              className="appbar__icon"
              aria-label="Partager"
              onClick={() => share()}
            >
              <Share2 size={20} />
            </button>
          ) : null
        }
      />

      <main className="page page--invoice">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={1} height={420} /> : null}

        {data ? (
          <>
            {cancelled ? (
              <Notice tone="warn">
                Commande annulée. Ce document ne vaut plus commande — ne l’envoyez pas.
              </Notice>
            ) : null}

            <article className={`invoice${cancelled ? ' invoice--cancelled' : ''}`}>
              <div className="invoice__brand">
                <Store size={30} />
                <span className="invoice__name">{business?.name}</span>
                {business?.tagline ? (
                  <span className="invoice__meta">{business.tagline}</span>
                ) : null}
                {business?.address ? (
                  <span className="invoice__meta">{business.address}</span>
                ) : null}
                {business?.phone ? (
                  <span className="invoice__meta">Tél : {business.phone}</span>
                ) : null}
              </div>

              <h2 className="invoice__title">{purchaseOrderHeading(priced)}</h2>

              <div className="small" style={{ display: 'grid', gap: 3, marginBottom: 14 }}>
                <span>
                  N° : <strong>{data.reference}</strong>
                </span>
                <span>Date : {shortDate(data.created_at)}</span>
                <span>Fournisseur : {data.supplier_name || '—'}</span>
                {/* Le statut appartient à l'en-tête, avec le reste de ce qui
                    identifie la pièce — pas entre le total et les observations. */}
                <span className="doc-status">
                  Statut :{' '}
                  <Badge tone={PO_STATUS_TONES[data.status]}>{PO_STATUS_LABELS[data.status]}</Badge>
                </span>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="num">Qté</th>
                      {priced ? <th className="num">Prix</th> : null}
                      {priced ? <th className="num">Total</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.product_name}
                          {/*
                            L'unité sous le nom plutôt que dans la colonne des
                            quantités : « 6 seau de 20 L » poussait la colonne
                            des totaux hors de la feuille sur un téléphone, et
                            le montant s'imprimait coupé.
                          */}
                          {item.unit_label ? (
                            <span className="muted small"> ({item.unit_label})</span>
                          ) : null}
                        </td>
                        <td className="num">{quantity(item.quantity_ordered)}</td>
                        {priced ? <td className="num">{amount(item.unit_cost)}</td> : null}
                        {priced ? (
                          <td className="num">
                            {amount(round2(Number(item.quantity_ordered) * Number(item.unit_cost)))}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {priced ? (
                <div className="invoice__total">
                  <span>TOTAL ESTIMÉ</span>
                  <span className="num">{money(total, currency)}</span>
                </div>
              ) : (
                /*
                 * Sans prix, pas de ligne de total : « 0 FCFA » se lirait comme
                 * une commande gratuite. Le document dit alors ce qu'il attend.
                 */
                <p className="invoice__thanks">
                  Merci de nous communiquer vos prix et vos délais pour ces articles.
                </p>
              )}

              {data.notes ? (
                <p className="invoice__note">
                  <strong>Observations : </strong>
                  {data.notes}
                </p>
              ) : null}

              {cancelled ? (
                <p className="invoice__void">
                  Commande annulée. Ce document ne vaut pas bon de commande.
                </p>
              ) : (
                <div className="invoice__signatures">
                  <div>
                    <span className="invoice__meta">Le gérant</span>
                    <span className="invoice__rule" />
                  </div>
                  <div>
                    <span className="invoice__meta">Le fournisseur</span>
                    <span className="invoice__rule" />
                  </div>
                </div>
              )}
            </article>

            <div className="invoice-actions no-print">
              <Button variant="success" onClick={() => share('whatsapp')}>
                <MessageCircle size={23} />
                Partager WhatsApp
              </Button>
              <Button
                onClick={() => window.print()}
                title="Choisissez Enregistrer au format PDF dans la fenêtre d’impression"
              >
                <FileDown size={23} />
                Télécharger PDF
              </Button>
              <Button variant="soft" onClick={() => window.print()}>
                <Printer size={23} />
                Imprimer
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}
