'use client';

import { use, useState } from 'react';
import { ExternalLink, FileText, PackageCheck, Paperclip, Share2 } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Notice,
  SelectField,
  Sheet,
  Skeleton,
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import {
  DOCUMENT_KINDS,
  PO_MANUAL_STATUSES,
  PO_STATUS_LABELS,
  PO_STATUS_TONES,
  canReceive,
  remainingOf,
} from '@/domain/purchase';
import { amount, dateTime, money, quantity } from '@/utils/format';

/**
 * Détail d'une commande fournisseur (maquette 8, §20-22).
 *
 * Le statut administratif — envoyée, facture reçue, payée — est posé à la main.
 * Le statut de livraison, lui, est déduit des quantités reçues : une commande ne
 * peut pas être marquée « livrée » alors qu'il reste des lignes à recevoir.
 */
export default function PurchaseOrderPage({ params }) {
  const { id } = use(params);
  const { currency } = useSession();
  const { data, loading, error, setData } = useResource(`/api/purchase-orders/${id}`);
  const [receiving, setReceiving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [issue, setIssue] = useState(null);

  async function share() {
    const lines = data.items
      .map(
        (item) => `• ${item.product_name} — ${quantity(item.quantity_ordered)} ${item.unit_label}`
      )
      .join('\n');
    const text = `Commande ${data.reference}\nFournisseur : ${data.supplier_name}\n\n${lines}\n\nTotal estimé : ${money(
      data.total_estimated,
      currency
    )}`;

    if (navigator.share) {
      await navigator.share({ title: `Commande ${data.reference}`, text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
  }

  async function setStatus(status) {
    setIssue(null);
    try {
      setData(await api.patch(`/api/purchase-orders/${id}`, { status }));
    } catch (error_) {
      setIssue(error_.message);
    }
  }

  return (
    <>
      <AppBar
        back="/purchases"
        title={data ? `Commande ${data.reference}` : 'Commande'}
        right={
          data ? (
            <button type="button" className="appbar__icon" aria-label="Partager" onClick={share}>
              <Share2 size={20} />
            </button>
          ) : null
        }
      />

      <main className="page">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {issue ? <Notice tone="error">{issue}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={120} /> : null}

        {data ? (
          <>
            <Card pad className="stack">
              <div className="total-line">
                <span className="muted">Fournisseur</span>
                <strong>{data.supplier_name}</strong>
              </div>
              <div className="total-line">
                <span className="muted">Date</span>
                <span>{dateTime(data.created_at)}</span>
              </div>
              <div className="total-line">
                <span className="muted">Statut</span>
                <Badge tone={PO_STATUS_TONES[data.status]}>{PO_STATUS_LABELS[data.status]}</Badge>
              </div>
            </Card>

            <Card>
              <CardHead title="Produits commandés" />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 16 }}>Produit</th>
                      <th className="num">Commandé</th>
                      <th className="num">Reçu</th>
                      <th className="num" style={{ paddingRight: 16 }}>
                        Coût
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ paddingLeft: 16 }}>
                          <div>{item.product_name}</div>
                          <div className="small muted">{item.unit_label}</div>
                        </td>
                        <td className="num">{quantity(item.quantity_ordered)}</td>
                        <td className="num">
                          <span
                            style={{
                              color:
                                remainingOf(item) === 0 ? 'var(--green-dark)' : 'var(--amber-ink)',
                            }}
                          >
                            {quantity(item.quantity_received)}
                          </span>
                        </td>
                        <td className="num" style={{ paddingRight: 16 }}>
                          {amount(item.unit_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: 16 }}>
                <div className="total-line total-line--grand" style={{ marginTop: 0 }}>
                  <span>Total estimé</span>
                  <span className="num amount">{money(data.total_estimated, currency)}</span>
                </div>
              </div>
            </Card>

            {data.notes ? <Notice>{data.notes}</Notice> : null}

            <Card>
              <CardHead
                title="Documents"
                action={
                  <button
                    type="button"
                    className="btn btn--soft btn--sm"
                    onClick={() => setAttaching(true)}
                  >
                    <Paperclip size={15} />
                    Joindre
                  </button>
                }
              />
              {data.documents.length === 0 ? (
                <Empty
                  icon={<FileText size={24} className="muted" />}
                  title="Aucun document"
                  hint="Bon de commande, facture fournisseur, preuve de paiement."
                />
              ) : (
                <div className="list">
                  {data.documents.map((document) => (
                    <div key={document.id} className="list__row">
                      <span className="thumb">
                        <FileText size={19} />
                      </span>
                      <div className="list__body">
                        <div className="list__title">{document.name}</div>
                        <div className="list__sub">{DOCUMENT_KINDS[document.kind]}</div>
                      </div>
                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn--soft btn--sm"
                        >
                          Voir
                          <ExternalLink size={14} />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {data.receipts.length > 0 ? (
              <Card>
                <CardHead title="Réceptions" />
                <div className="list">
                  {data.receipts.map((receipt) => (
                    <div key={receipt.id} className="list__row">
                      <div className="list__body">
                        <div className="list__title">{receipt.reference}</div>
                        <div className="list__sub">{dateTime(receipt.received_at)}</div>
                      </div>
                      {receipt.notes ? <span className="small muted">{receipt.notes}</span> : null}
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {data.status !== 'CANCELLED' ? (
              <SelectField
                label="Statut administratif"
                hint="La livraison, elle, est déduite des quantités reçues."
                value={PO_MANUAL_STATUSES.includes(data.status) ? data.status : ''}
                onChange={(event) => setStatus(event.target.value)}
              >
                {!PO_MANUAL_STATUSES.includes(data.status) ? (
                  <option value="">{PO_STATUS_LABELS[data.status]}</option>
                ) : null}
                {PO_MANUAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PO_STATUS_LABELS[status]}
                  </option>
                ))}
              </SelectField>
            ) : null}

            {canReceive(data, data.items) ? (
              <Button variant="success" block onClick={() => setReceiving(true)}>
                <PackageCheck size={18} />
                Réceptionner une livraison
              </Button>
            ) : (
              <Notice tone="warn">
                {data.status === 'CANCELLED'
                  ? 'Commande annulée.'
                  : 'Toutes les quantités commandées ont été reçues.'}
              </Notice>
            )}

            <ReceiveSheet
              open={receiving}
              order={data}
              onClose={() => setReceiving(false)}
              onConfirm={async (body) => {
                setData(await api.post(`/api/purchase-orders/${id}/receive`, body));
                setReceiving(false);
              }}
            />

            <AttachSheet
              open={attaching}
              onClose={() => setAttaching(false)}
              onConfirm={async (body) => {
                setData(await api.post(`/api/purchase-orders/${id}/documents`, body));
                setAttaching(false);
              }}
            />
          </>
        ) : null}
      </main>
    </>
  );
}

/**
 * Réception (§22).
 *
 * Chaque ligne est pré-remplie avec le reste à livrer, et se corrige à la
 * baisse : le cas courant est « tout est arrivé », le cas fréquent est « il
 * manque vingt sacs ». Le stock augmente d'autant, pas d'une unité de plus.
 */
function ReceiveSheet({ open, order, onClose, onConfirm }) {
  const [lines, setLines] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pending = order.items.filter((item) => remainingOf(item) > 0);
  const valueOf = (item) => (lines[item.id] === undefined ? remainingOf(item) : lines[item.id]);

  return (
    <Sheet open={open} title="Réceptionner" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p className="small muted">
        Indiquez ce qui a réellement été livré. Le stock augmentera de ces quantités et le coût
        d&apos;achat sera recalculé en moyenne pondérée.
      </p>

      {pending.map((item) => (
        <TextField
          key={item.id}
          label={`${item.product_name} (${item.unit_label})`}
          hint={`Reste à livrer : ${quantity(remainingOf(item))}`}
          type="number"
          inputMode="decimal"
          min="0"
          max={remainingOf(item)}
          step="any"
          value={valueOf(item)}
          onChange={(event) => setLines({ ...lines, [item.id]: event.target.value })}
        />
      ))}

      <TextField
        label="Note (optionnelle)"
        placeholder="Livraison partielle, 20 sacs à suivre"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <Button
        variant="success"
        block
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onConfirm({
              notes,
              lines: pending.map((item) => ({ itemId: item.id, quantity: valueOf(item) })),
            });
          } catch (issue) {
            setError(issue.message);
          }
          setBusy(false);
        }}
      >
        {busy ? 'Enregistrement…' : 'Enregistrer la réception'}
      </Button>
    </Sheet>
  );
}

/**
 * Pièce jointe.
 *
 * QuincaFlow n'héberge pas les fichiers en V1 : le gérant colle le lien de la
 * photo qu'il a déjà envoyée par WhatsApp ou déposée sur son cloud. C'est le
 * flux qu'il pratique déjà, et cela évite d'embarquer un service de stockage
 * dans un MVP.
 */
function AttachSheet({ open, onClose, onConfirm }) {
  const [form, setForm] = useState({ kind: 'PURCHASE_ORDER', name: '', url: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Sheet open={open} title="Joindre un document" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <SelectField
        label="Type"
        value={form.kind}
        onChange={(event) => setForm({ ...form, kind: event.target.value })}
      >
        {Object.entries(DOCUMENT_KINDS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Nom"
        placeholder="Facture Bâtir Plus mars"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <TextField
        label="Lien (optionnel)"
        type="url"
        placeholder="https://…"
        hint="Lien vers la photo ou le fichier, déjà stocké de votre côté."
        value={form.url}
        onChange={(event) => setForm({ ...form, url: event.target.value })}
      />
      <Button
        block
        disabled={busy || !form.name.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onConfirm(form);
          } catch (issue) {
            setError(issue.message);
          }
          setBusy(false);
        }}
      >
        {busy ? 'Enregistrement…' : 'Joindre'}
      </Button>
    </Sheet>
  );
}
