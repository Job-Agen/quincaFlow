'use client';

import { use, useState } from 'react';
import { Mail, Printer, Share2, XCircle, FileDown, MessageCircle } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Button, Notice, Segmented, Sheet, Skeleton, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { saleBalance } from '@/domain/credit';
import { envoyerFacture } from '@/client/partage';
import { PRINT_FORMAT_LABELS, TICKET_WIDTHS, isTicket, readFormat } from '@/domain/ticket';
import { printWith, usePrintFormat } from '@/client/print';
import { amount, dateTime, money, quantity } from '@/utils/format';
import { errorMessage } from '@/utils/errors';
import InvoiceDocument from '@/components/documents/InvoiceDocument';
import EnvoiMailSheet from '@/components/documents/EnvoiMailSheet';
import type { ContactRow, Sale } from '@/types';

/**
 * Facture / reçu (maquette 4, §15).
 *
 * Le document est du HTML mis en forme pour l'impression plutôt qu'un PDF
 * généré côté serveur : « Imprimer » propose « Enregistrer au format PDF » sur
 * tous les navigateurs mobiles courants, ce qui couvre les deux besoins sans
 * embarquer de moteur PDF ni faire transiter le document par un serveur.
 */
export default function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { business, currency, isOwner } = useSession();
  const { data: sale, loading, error, setData } = useResource<Sale>(`/api/sales/${id}`);
  const [cancelling, setCancelling] = useState(false);
  const [format, choisirFormat] = usePrintFormat();
  // Ce que le client doit encore : affiché seulement s'il reste quelque chose,
  // un « Reste dû : 0 » sur une facture soldée semant le doute pour rien.
  const reste = sale ? saleBalance(sale.total, sale.amount_paid) : 0;
  const cancelled = sale?.status === 'CANCELLED';
  const [envoi, setEnvoi] = useState<'en-cours' | 'téléchargé' | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [parMail, setParMail] = useState(false);

  // La fiche du client n'est chargée que si la facture en porte un : c'est elle
  // qui propose l'adresse d'envoi (§57).
  const { data: client } = useResource<ContactRow>(
    sale?.customer_id ? `/api/customers/${sale.customer_id}` : null
  );

  async function share() {
    if (!sale) return;
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

    // Le partage du téléphone propose WhatsApp parmi les autres applications,
    // et emporte le PDF avec lui (§57). Là où il n'existe pas — les navigateurs
    // de bureau —, le fichier est téléchargé et wa.me s'ouvre avec le texte :
    // le gérant joint le PDF lui-même, en deux gestes.
    setEnvoi('en-cours');
    try {
      const issue = await envoyerFacture(sale, business, currency, text);
      if (issue === 'téléchargé') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        setEnvoi('téléchargé');
      } else {
        setEnvoi(null);
      }
    } catch (issue) {
      setEnvoi(null);
      setErreurEnvoi(errorMessage(issue));
    }
  }

  return (
    <>
      <AppBar
        back="/dashboard"
        title="Facture"
        right={
          sale ? (
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
        {loading && !sale ? <Skeleton count={1} height={420} /> : null}

        {sale ? (
          <>
            {cancelled ? (
              <Notice tone="warn">
                Vente annulée{sale.note ? ` — ${sale.note}` : ''}. Le stock a été restitué.
              </Notice>
            ) : null}

            <InvoiceDocument sale={sale} business={business} currency={currency} />

            {/* Le format d'impression, choisi une fois et retenu : une boutique
              a une imprimante, pas trois (§54). */}
            <div className="field no-print">
              <span className="field__label">Format d&apos;impression</span>
              <Segmented
                options={[
                  { value: 'A4', label: PRINT_FORMAT_LABELS.A4 ?? 'Facture A4' },
                  ...TICKET_WIDTHS.map((largeur) => ({
                    value: String(largeur),
                    label: PRINT_FORMAT_LABELS[String(largeur)] ?? `Ticket ${largeur} mm`,
                  })),
                ]}
                value={String(format)}
                onChange={(valeur) => choisirFormat(readFormat(valeur))}
              />
            </div>

            {erreurEnvoi ? (
              <Notice tone="error" className="no-print">
                {erreurEnvoi}
              </Notice>
            ) : null}
            {envoi === 'téléchargé' ? (
              <Notice tone="warn" className="no-print">
                Ce navigateur ne sait pas joindre un fichier à un message. La facture a été
                téléchargée : joignez-la à la conversation WhatsApp qui vient de s’ouvrir.
              </Notice>
            ) : null}

            {parMail && sale ? (
              <EnvoiMailSheet sale={sale} client={client} onClose={() => setParMail(false)} />
            ) : null}

            <div className="invoice-actions no-print">
              <Button variant="success" disabled={envoi === 'en-cours'} onClick={() => share()}>
                <MessageCircle size={23} />
                {envoi === 'en-cours' ? 'Préparation…' : 'Envoyer par WhatsApp'}
              </Button>
              <Button variant="soft" disabled={cancelled} onClick={() => setParMail(true)}>
                <Mail size={23} />
                Envoyer par e-mail
              </Button>
              <Button
                onClick={() => printWith(format)}
                title="Choisissez Enregistrer au format PDF dans la fenêtre d’impression"
              >
                <FileDown size={23} />
                Télécharger PDF
              </Button>
              <Button variant="soft" onClick={() => printWith(format)}>
                <Printer size={23} />
                {isTicket(format) ? `Imprimer le ticket ${format} mm` : 'Imprimer'}
              </Button>
            </div>

            {sale.status === 'COMPLETED' && isOwner ? (
              <button
                type="button"
                className="secondary-action no-print"
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
              onConfirm={async (reason: string) => {
                setData(await api.post<Sale>(`/api/sales/${id}/cancel`, { reason }));
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
function CancelSheet({
  open,
  reference,
  onClose,
  onConfirm,
}: {
  open: boolean;
  reference: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            setError(errorMessage(issue));
          }
          setBusy(false);
        }}
      >
        {busy ? 'Annulation…' : "Confirmer l'annulation"}
      </Button>
    </Sheet>
  );
}
