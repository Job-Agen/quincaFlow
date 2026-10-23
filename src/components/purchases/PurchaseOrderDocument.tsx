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
import { FileDown, MessageCircle, Printer, Share2 } from 'lucide-react';
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
import Letterhead from '@/components/documents/Letterhead';
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

            <article className={`invoice doc${cancelled ? ' invoice--cancelled' : ''}`}>
              {/* Même forme que la facture (§56) : l'identité à gauche, la
                pièce à droite. Le fournisseur lit deux documents par jour, et
                reconnaît celui-ci à sa mise en page avant de le lire. */}
              <div className="doc__head">
                <Letterhead business={business} />

                <div className="doc__piece">
                  <h2 className="invoice__title">{purchaseOrderHeading(priced)}</h2>
                  <dl className="doc__champs">
                    <dt>N°</dt>
                    <dd>
                      <strong>{data.reference}</strong>
                    </dd>
                    <dt>Date</dt>
                    <dd>{shortDate(data.created_at)}</dd>
                    {/* Le statut appartient à l'en-tête, avec le reste de ce
                        qui identifie la pièce — pas entre le total et les
                        observations. */}
                    <dt>Statut</dt>
                    <dd className="doc-status">
                      <Badge tone={PO_STATUS_TONES[data.status]}>
                        {PO_STATUS_LABELS[data.status]}
                      </Badge>
                    </dd>
                  </dl>
                </div>
              </div>

              <div className="doc__parties">
                <div className="doc__partie">
                  <span className="doc__partie-titre">Commande adressée à</span>
                  <strong>{data.supplier_name || '—'}</strong>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                          <th>Désignation</th>
                      <th className="num">Qté</th>
                      {priced ? <th className="num">Prix ({currency})</th> : null}
                      {priced ? <th className="num">Total ({currency})</th> : null}
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
                <div className="doc__totaux">
                  <div className="doc__ligne doc__ligne--total">
                    <span>TOTAL ESTIMÉ</span>
                    <span className="num">{money(total, currency)}</span>
                  </div>
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
              <footer className="doc__pied">
                {business?.name}
                {business?.tax_id ? ` · IFU / NIF : ${business.tax_id}` : ''}
                {business?.phone ? ` · Tél : ${business.phone}` : ''}
                <br />
                {priced
                  ? 'Prix et quantités à confirmer par le fournisseur avant livraison.'
                  : 'Document établi pour demande de prix. Il ne vaut pas engagement d’achat.'}
              </footer>
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
