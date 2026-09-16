'use client';

import { use, useMemo, useState } from 'react';
import { FileDown, Printer, Share2, Store, XCircle } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Button, Notice, Sheet, Skeleton, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/domain/sale';
import { buildInvoiceDocument } from '@/domain/invoice';
import { downloadInvoicePdf, invoicePdfFile } from '@/lib/invoicePdf';
import { amount, dateTime, money, quantity } from '@/utils/format';

/**
 * Facture / reçu (maquette 4, §15).
 *
 * Trois sorties pour un seul document : l'écran lui-même, mis en forme pour
 * l'impression ; un PDF ; et le partage natif. Le PDF est produit dans le
 * navigateur, à la demande — voir `lib/invoicePdf.js` pour la raison.
 *
 * Le partage joint le PDF quand la plateforme l'accepte, et retombe sur le texte
 * sinon : un commerçant qui envoie sa facture par WhatsApp (§19) transmet une
 * pièce jointe que son client peut garder, pas un pavé de texte recopié.
 */
export default function SalePage({ params }) {
  const { id } = use(params);
  const { business, currency, isOwner } = useSession();
  const { data: sale, loading, error, setData } = useResource(`/api/sales/${id}`);
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const cancelled = sale?.status === 'CANCELLED';

  const invoice = useMemo(
    () => (sale ? buildInvoiceDocument({ sale, business, currency }) : null),
    [sale, business, currency]
  );

  /** Le PDF, hors du flux de rendu : le moteur se charge au premier appel. */
  async function exportPdf() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadInvoicePdf(invoice);
    } catch {
      setExportError("Le PDF n'a pas pu être produit. Utilisez « Imprimer » en attendant.");
    }
    setExporting(false);
  }

  async function share() {
    const lines = sale.items
      .map(
        (item) =>
          `• ${item.product_name} ${quantity(item.quantity)} ${item.unit_label} × ${amount(
            item.unit_price
          )} = ${amount(item.line_total)}`
      )
      .join('\n');

    // L'annulation ouvre et ferme le message : c'est ce texte que le client
    // reçoit, et rien d'autre ne l'avertit que la facture ne vaut plus rien.
    const void_ = cancelled ? '⚠️ FACTURE ANNULÉE — ce document ne vaut pas justificatif.' : '';
    const text = [
      void_,
      business?.name || 'Facture',
      `Facture ${sale.invoice_reference}`,
      lines,
      '',
      `TOTAL : ${money(sale.total, currency)}`,
      cancelled ? '\n⚠️ Vente annulée.' : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Le partage natif ouvre WhatsApp parmi les autres applications ; le lien
    // wa.me reste le repli sur les navigateurs de bureau qui ne l'implémentent pas.
    if (!navigator.share) {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      return;
    }

    const title = `Facture ${sale.invoice_reference}`;

    // La pièce jointe d'abord, le texte en repli. `canShare` est interrogé avec
    // le fichier réel : certaines plateformes annoncent `share` sans accepter de
    // fichiers, et un partage refusé ne doit pas laisser le commerçant sans rien.
    try {
      const file = await invoicePdfFile(invoice);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return;
      }
    } catch (issue) {
      // Un abandon volontaire du partage n'est pas une panne : on s'arrête là
      // plutôt que de rouvrir une seconde feuille de partage dans son dos.
      if (issue?.name === 'AbortError') return;
    }

    await navigator.share({ title, text }).catch(() => {});
  }

  return (
    <>
      <AppBar
        back="/"
        title="Facture"
        right={
          sale ? (
            <button type="button" className="appbar__icon" aria-label="Partager" onClick={share}>
              <Share2 size={20} />
            </button>
          ) : null
        }
      />

      <main className="page">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !sale ? <Skeleton count={1} height={420} /> : null}

        {sale ? (
          <>
            {cancelled ? (
              <Notice tone="warn">
                Vente annulée{sale.note ? ` — ${sale.note}` : ''}. Le stock a été restitué.
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

              <h2 className="invoice__title">FACTURE</h2>

              <div className="small" style={{ display: 'grid', gap: 3, marginBottom: 14 }}>
                <span>
                  N° : <strong>{sale.invoice_reference}</strong>
                </span>
                <span>Date : {dateTime(sale.created_at)}</span>
                <span>Client : {sale.customer_name || 'Client comptoir'}</span>
                <span>Vente : {sale.reference}</span>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="num">Qté</th>
                      <th className="num">Prix</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.product_name}
                          {item.unit_factor > 1 ? (
                            <span className="muted small"> ({item.unit_label})</span>
                          ) : null}
                        </td>
                        <td className="num">{quantity(item.quantity)}</td>
                        <td className="num">{amount(item.unit_price)}</td>
                        <td className="num">{amount(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {sale.discount > 0 ? (
                <div className="total-line small">
                  <span>Remise</span>
                  <span className="num">− {amount(sale.discount)}</span>
                </div>
              ) : null}

              <div className="invoice__total">
                <span>TOTAL</span>
                <span className="num">{money(sale.total, currency)}</span>
              </div>

              <div className="total-line small">
                <span className="muted">{PAYMENT_METHOD_LABELS[sale.payment_method]}</span>
                {/*
                  Sur une vente annulée, « Payée » en vert affirme quelque chose
                  de faux : l'encaissement a été rendu. Le statut d'origine est
                  conservé en base, mais la facture n'a plus à s'en prévaloir.
                */}
                {cancelled ? (
                  <Badge tone="red">Annulée</Badge>
                ) : (
                  <Badge tone={sale.payment_status === 'PAID' ? 'green' : 'amber'}>
                    {PAYMENT_STATUS_LABELS[sale.payment_status]}
                  </Badge>
                )}
              </div>

              {cancelled ? (
                <p className="invoice__void">
                  Facture annulée le {dateTime(sale.updated_at || sale.created_at)}
                  {sale.note ? ` — ${sale.note}` : ''}. Ce document ne vaut pas justificatif.
                </p>
              ) : (
                <p className="invoice__thanks">Merci pour votre confiance !</p>
              )}
            </article>

            {exportError ? (
              <div className="no-print">
                <Notice tone="error">{exportError}</Notice>
              </div>
            ) : null}

            <div className="grid-2 no-print">
              <Button variant="success" onClick={share}>
                <Share2 size={18} />
                Partager
              </Button>
              <Button variant="soft" disabled={exporting} onClick={exportPdf}>
                <FileDown size={18} />
                {exporting ? 'PDF…' : 'PDF'}
              </Button>
            </div>

            <button
              type="button"
              className="btn btn--ghost btn--block no-print"
              onClick={() => window.print()}
            >
              <Printer size={18} />
              Imprimer
            </button>

            {sale.status === 'COMPLETED' && isOwner ? (
              <button
                type="button"
                className="btn btn--ghost btn--block no-print"
                style={{ color: 'var(--red)' }}
                onClick={() => setCancelling(true)}
              >
                <XCircle size={18} />
                Annuler cette vente
              </button>
            ) : null}

            <CancelSheet
              open={cancelling}
              reference={sale.reference}
              onClose={() => setCancelling(false)}
              onConfirm={async (reason) => {
                setData(await api.post(`/api/sales/${id}/cancel`, { reason }));
                setCancelling(false);
              }}
            />
          </>
        ) : null}
      </main>
    </>
  );
}

/**
 * Annulation (§25). Le motif est demandé parce que le journal de stock
 * conservera le mouvement inverse : sans raison, personne ne saura six mois plus
 * tard pourquoi cinq serrures sont revenues en rayon.
 */
function CancelSheet({ open, reference, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Sheet open={open} title={`Annuler la vente ${reference}`} onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Notice tone="warn">
        La vente restera dans l&apos;historique, marquée annulée, et les articles retourneront en
        stock par un mouvement inverse.
      </Notice>
      <TextField
        label="Motif"
        placeholder="Erreur de saisie, client s'est ravisé…"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        variant="danger"
        block
        disabled={busy || !reason.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onConfirm(reason.trim());
          } catch (issue) {
            setError(issue.message);
          }
          setBusy(false);
        }}
      >
        {busy ? 'Annulation…' : "Confirmer l'annulation"}
      </Button>
    </Sheet>
  );
}
