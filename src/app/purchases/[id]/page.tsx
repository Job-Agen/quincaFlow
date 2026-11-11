'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ExternalLink,
  FileText,
  PackageCheck,
  Download,
  Paperclip,
  Pencil,
  Share2,
  Trash2,
  Wallet,
} from 'lucide-react';
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
import { envoyerBonDeCommande } from '@/client/partage';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import {
  DOCUMENT_KINDS,
  PO_MANUAL_STATUSES,
  PO_STATUS_LABELS,
  PO_STATUS_TONES,
  canReceive,
  verrouDeCommande,
  verrouDeSuppression,
  orderMessageLines,
  purchaseOrderMessage,
  remainingOf,
} from '@/domain/purchase';
import { paymentLabel } from '@/domain/sale';
import SupplierPaymentSheet from '@/components/purchases/SupplierPaymentSheet';
import SuppressionCommandeSheet from '@/components/purchases/SuppressionCommandeSheet';
import PieceJointeSheet from '@/components/purchases/PieceJointeSheet';
import { TYPES_ACCEPTES, poidsLisible } from '@/domain/pieceJointe';
import { amount, dateTime, shortDate, money, quantity, withUnit } from '@/utils/format';
import { errorMessage } from '@/utils/errors';
import type {
  DocumentRow,
  PurchaseOrder,
  PurchaseOrderItemRow,
  PurchaseOrderStatus,
} from '@/types';

/**
 * Détail d'une commande fournisseur (maquette 8, §20-22).
 *
 * Le statut administratif — envoyée, facture reçue, payée — est posé à la main.
 * Le statut de livraison, lui, est déduit des quantités reçues : une commande ne
 * peut pas être marquée « livrée » alors qu'il reste des lignes à recevoir.
 */
export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { business, currency, isOwner } = useSession();
  const { data, loading, error, setData } = useResource<PurchaseOrder>(
    `/api/purchase-orders/${id}`
  );
  const [receiving, setReceiving] = useState(false);
  const [livraison, setLivraison] = useState(false);
  const [reception, setReception] = useState(false);
  const [paying, setPaying] = useState(false);
  const [suppression, setSuppression] = useState(false);

  // Les mêmes règles que le serveur, lues sur ce que la commande porte déjà.
  // Modifier et supprimer ne répondent plus tout à fait à la même : une
  // commande annulée ne se réécrit pas, mais elle s'efface (§64).
  const verrou = data
    ? verrouDeCommande(data.status, data.receipts.length, data.payments.length)
    : null;
  const verrouSuppression = data
    ? verrouDeSuppression(data.status, data.receipts.length, data.payments.length)
    : null;

  const [attaching, setAttaching] = useState(false);
  const [envoi, setEnvoi] = useState<'en-cours' | null>(null);
  const [aDetacher, setADetacher] = useState<DocumentRow | null>(null);
  const [detachement, setDetachement] = useState(false);
  const [erreurDetachement, setErreurDetachement] = useState<string | null>(null);

  async function detacher() {
    if (!aDetacher) return;
    setDetachement(true);
    setErreurDetachement(null);
    try {
      await api.delete(`/api/documents/${aDetacher.id}`);
      setData(await api.get<PurchaseOrder>(`/api/purchase-orders/${id}`));
      setADetacher(null);
    } catch (souci) {
      setErreurDetachement(errorMessage(souci));
    }
    setDetachement(false);
  }
  const [issue, setIssue] = useState<string | null>(null);

  /**
   * Le message part de la fonction du domaine, pas d'ici (§43).
   *
   * Cet écran composait sa propre version : un titre, des quantités, aucun
   * prix, aucune identité de boutique. Le fournisseur recevait une liste sans
   * savoir qui commandait ni à quel tarif.
   */
  async function share() {
    if (!data) return;
    const text = purchaseOrderMessage(
      {
        reference: data.reference,
        supplierName: data.supplier_name,
        createdAt: data.created_at,
        notes: data.notes,
        cancelled: data.status === 'CANCELLED',
      },
      orderMessageLines(data.items),
      business,
      currency
    );

    // Le bon part en PDF joint, comme depuis le document lui-même (§60) : le
    // fournisseur reçoit une pièce qu'il peut classer et signer, pas une liste
    // dans une bulle de conversation.
    setEnvoi('en-cours');
    try {
      const issue = await envoyerBonDeCommande(data, business, currency, text);
      if (issue === 'téléchargé') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      }
    } catch {
      // Le PDF n'a pas pu être fabriqué : plutôt que de ne rien faire, le
      // message texte part quand même — c'est ce que ce bouton faisait avant.
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
    setEnvoi(null);
  }

  async function setStatus(status: PurchaseOrderStatus) {
    setIssue(null);
    // « Livrée » fait entrer du stock (§63) : on nomme ce qui va entrer avant
    // de le faire. Un choix mal visé dans une liste déroulante ajouterait
    // cinquante sacs à l'inventaire, et rien ne le dirait.
    if (status === 'RECEIVED') {
      if (data && data.items.some((item) => remainingOf(item) > 0)) setLivraison(true);
      return;
    }
    try {
      setData(await api.patch<PurchaseOrder>(`/api/purchase-orders/${id}`, { status }));
    } catch (error_) {
      setIssue(errorMessage(error_));
    }
  }

  /** Reçoit tout ce qui reste, par le chemin ordinaire de la réception. */
  async function recevoirTout() {
    if (!data) return;
    setReception(true);
    setIssue(null);
    try {
      setData(await api.patch<PurchaseOrder>(`/api/purchase-orders/${id}`, { status: 'RECEIVED' }));
      setLivraison(false);
    } catch (error_) {
      setIssue(errorMessage(error_));
    }
    setReception(false);
  }

  return (
    <>
      <AppBar
        back="/purchases"
        title={data ? `Commande ${data.reference}` : 'Commande'}
        right={
          data ? (
            <button
              type="button"
              className="appbar__icon"
              aria-label="Partager"
              // Fabriquer le PDF prend un instant : sans cette garde, deux
              // appuis lanceraient deux feuilles de partage.
              disabled={envoi === 'en-cours'}
              onClick={share}
            >
              <Share2 size={20} />
            </button>
          ) : null
        }
      />

      <main className="page page--order">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {issue ? <Notice tone="error">{issue}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={120} /> : null}

        {data ? (
          <>
            <Card pad className="order-meta">
              <div className="total-line">
                <span className="muted">Fournisseur</span>
                <strong>{data.supplier_name}</strong>
              </div>
              <div className="total-line">
                <span className="muted">Date</span>
                <span>{shortDate(data.created_at)}</span>
              </div>
              <div className="total-line">
                <span className="muted">Statut</span>
                <Badge tone={PO_STATUS_TONES[data.status]}>{PO_STATUS_LABELS[data.status]}</Badge>
              </div>
            </Card>

            {/* Ce qui est livré, ce qui est réglé, ce qui reste (§53). La
              carte n'apparaît qu'une fois quelque chose livré : avant, il n'y a
              rien à payer, et un « 0 reste dû » se lirait comme une commande
              gratuite. Propriétaire seulement — ces montants sont des prix
              d'achat (§5). */}
            {isOwner && data.received > 0 ? (
              <Card pad className="order-meta">
                <CardHead title="Règlement" />
                <div className="total-line">
                  <span className="muted">Livré à ce jour</span>
                  <strong className="num">{money(data.received, currency)}</strong>
                </div>
                <div className="total-line">
                  <span className="muted">Déjà réglé</span>
                  <span className="num">{money(data.amount_paid, currency)}</span>
                </div>
                <div className="total-line total-line--grand">
                  <span>Reste à payer</span>
                  <strong className="num">{money(data.balance, currency)}</strong>
                </div>

                {data.payments.length > 0 ? (
                  <div className="list">
                    {data.payments.map((versement) => (
                      <div key={versement.id} className="list__row">
                        <div className="list__body">
                          <div className="list__title">
                            {paymentLabel(versement.method, versement.provider)}
                          </div>
                          <div className="list__sub">
                            {dateTime(versement.created_at)}
                            {versement.note ? ` · ${versement.note}` : ''}
                          </div>
                        </div>
                        <strong className="num">{money(versement.amount, currency)}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                {data.balance > 0 && data.status !== 'CANCELLED' ? (
                  <Button variant="soft" block onClick={() => setPaying(true)}>
                    <Wallet size={18} />
                    Enregistrer un règlement
                  </Button>
                ) : (
                  <p className="small muted">Cette commande est soldée.</p>
                )}
              </Card>
            ) : null}

            {paying && data ? (
              <SupplierPaymentSheet
                orderId={data.id}
                owed={data.balance}
                currency={currency}
                onClose={() => setPaying(false)}
                onSaved={(order) => {
                  setData(order);
                  setPaying(false);
                }}
              />
            ) : null}

            <Card>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 16 }}>Produit</th>
                      <th className="num">Qté</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ paddingLeft: 16 }}>
                          <div>{item.product_name}</div>
                        </td>
                        <td className="num">{quantity(item.quantity_ordered)}</td>
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

            {/* Le document mis en page, à envoyer au fournisseur (§43). */}
            <Link href={`/purchases/${id}/document`} className="btn btn--soft btn--block">
              <FileText size={18} />
              Voir le bon de commande
            </Link>

            {data.notes ? <Notice>{data.notes}</Notice> : null}

            <Card>
              <CardHead
                title="Documents"
                action={
                  isOwner ? (
                    <button
                      type="button"
                      className="btn btn--soft btn--sm"
                      onClick={() => setAttaching(true)}
                    >
                      <Paperclip size={15} />
                      Joindre
                    </button>
                  ) : null
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
                  {data.documents.map((document) => {
                    // Un fichier joint s'ouvre par sa propre route ; un lien
                    // reste un lien vers ailleurs. Les deux cas se distinguent
                    // ici et non à l'œil du gérant (§59).
                    const type = document.mime ? TYPES_ACCEPTES[document.mime] : undefined;
                    return (
                      <div key={document.id} className="list__row">
                        <span className="thumb">
                          <FileText size={19} />
                        </span>
                        <div className="list__body">
                          <div className="list__title">{document.name}</div>
                          {/* Le format et le poids, et rien de plus : le nom
                            que le gérant a écrit dit déjà de quelle pièce il
                            s'agit, et une troisième mention renvoyait la ligne
                            à la ligne — les pièces lourdes devenaient plus
                            hautes que les légères. */}
                          <div className="list__sub">
                            {document.size_bytes
                              ? `${type?.libelle ?? 'Fichier'} · ${poidsLisible(document.size_bytes)}`
                              : document.url
                                ? 'Lien'
                                : (DOCUMENT_KINDS[document.kind as keyof typeof DOCUMENT_KINDS] ??
                                  document.kind)}
                          </div>
                        </div>
                        {document.has_file ? (
                          <a
                            href={`/api/documents/${document.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn--soft btn--sm"
                          >
                            {type?.enLigne ? 'Voir' : 'Ouvrir'}
                            {type?.enLigne ? <ExternalLink size={14} /> : <Download size={14} />}
                          </a>
                        ) : document.url ? (
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
                        {isOwner ? (
                          <button
                            type="button"
                            className="list__supprimer"
                            aria-label={`Détacher ${document.name}`}
                            onClick={() => setADetacher(document)}
                          >
                            <Trash2 size={17} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
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

            {canReceive(data, data.items) && isOwner ? (
              <Button variant="success" block onClick={() => setReceiving(true)}>
                <PackageCheck size={18} />
                Marquer comme livrée
              </Button>
            ) : (
              <Notice tone="warn">
                {data.status === 'CANCELLED'
                  ? 'Commande annulée.'
                  : canReceive(data, data.items)
                    ? 'Le propriétaire peut enregistrer la réception de cette commande.'
                    : 'Toutes les quantités commandées ont été reçues.'}
              </Notice>
            )}

            {/* Modifier et supprimer ne s'offrent que tant que rien ne dépend
              de la commande : au-delà, réécrire ses lignes falsifierait le
              stock déjà entré, et la supprimer emporterait un règlement (§58).
              Le serveur refuse de toute façon — l'écran n'est pas un
              garde-fou —, mais proposer un geste qui sera refusé est une
              promesse qu'on ne tient pas. */}
            {isOwner ? (
              <div className="exports-row no-print">
                {verrou && verrouSuppression ? (
                  <p className="small muted">{verrou}</p>
                ) : (
                  <>
                    {verrou ? null : (
                      <Link href={`/purchases/${data.id}/edit`} className="btn btn--soft btn--sm">
                        <Pencil size={16} />
                        Modifier
                      </Link>
                    )}
                    {verrouSuppression ? null : (
                      <Button variant="soft" size="sm" onClick={() => setSuppression(true)}>
                        <Trash2 size={16} />
                        Supprimer
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {suppression ? (
              <SuppressionCommandeSheet
                id={data.id}
                reference={data.reference}
                lignes={data.items.length}
                onClose={() => setSuppression(false)}
                onSupprimee={() => router.replace('/purchases')}
              />
            ) : null}

            <details className="additional-details">
              <summary>Suivi des réceptions et statut administratif</summary>
              <div className="stack">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>Reçu</th>
                        <th>Coût unitaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.product_name} ({item.unit_label})
                          </td>
                          <td>
                            {quantity(item.quantity_received)} / {quantity(item.quantity_ordered)}
                          </td>
                          <td>{amount(item.unit_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.status !== 'CANCELLED' && isOwner ? (
                  <SelectField
                    label="Statut administratif"
                    hint="« Livrée » reçoit tout ce qui reste et met le stock à jour."
                    value={PO_MANUAL_STATUSES.includes(data.status) ? data.status : ''}
                    onChange={(event) => setStatus(event.target.value as PurchaseOrderStatus)}
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
              </div>
            </details>

            {livraison ? (
              <Sheet
                open
                title="Marquer la commande livrée"
                onClose={() => setLivraison(false)}
              >
                <p className="small">
                  Tout ce qui reste à livrer sera reçu, le stock augmentera d’autant et le coût
                  d’achat sera recalculé en moyenne pondérée.
                </p>
                <ul className="purchase-items">
                  {data.items
                    .filter((item) => remainingOf(item) > 0)
                    .map((item) => (
                      <li key={item.id} className="total-line">
                        <span>{item.product_name}</span>
                        <strong className="num">
                          {withUnit(remainingOf(item), item.unit_label)}
                        </strong>
                      </li>
                    ))}
                </ul>
                <Button variant="success" block disabled={reception} onClick={recevoirTout}>
                  <PackageCheck size={18} />
                  {reception ? 'Réception…' : 'Confirmer la réception'}
                </Button>
                {/* Tout n'arrive pas toujours d'un coup : l'autre porte reste
                  ouverte, celle où l'on corrige ligne par ligne. */}
                <Button
                  variant="soft"
                  block
                  disabled={reception}
                  onClick={() => {
                    setLivraison(false);
                    setReceiving(true);
                  }}
                >
                  Saisir des quantités différentes
                </Button>
              </Sheet>
            ) : null}

            <ReceiveSheet
              open={receiving}
              order={data}
              onClose={() => setReceiving(false)}
              onConfirm={async (body) => {
                setData(await api.post<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, body));
                setReceiving(false);
              }}
            />

            <PieceJointeSheet
              open={attaching}
              onClose={() => setAttaching(false)}
              onConfirm={async (body) => {
                setData(
                  await api.post<PurchaseOrder>(`/api/purchase-orders/${id}/documents`, body)
                );
                setAttaching(false);
              }}
            />

            {aDetacher ? (
              <Sheet
                open
                title="Détacher le document"
                onClose={() => setADetacher(null)}
              >
                {erreurDetachement ? (
                  <Notice tone="error">{erreurDetachement}</Notice>
                ) : null}
                <p className="small">
                  <strong>{aDetacher.name}</strong> sera retiré de cette commande. Le fichier est
                  effacé : il n’y a pas de corbeille.
                </p>
                <Button variant="danger" block disabled={detachement} onClick={detacher}>
                  {detachement ? 'Retrait…' : 'Détacher'}
                </Button>
              </Sheet>
            ) : null}
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
function ReceiveSheet({
  open,
  order,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: PurchaseOrder;
  onClose: () => void;
  onConfirm: (body: {
    lines: { itemId: string; quantity: number }[];
    notes: string;
  }) => Promise<void>;
}) {
  // Quantités saisies, par identifiant de ligne. Une ligne absente signifie
  // « le reste à livrer », valeur pré-remplie tant que le gérant n'y touche pas.
  const [lines, setLines] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = order.items.filter((item) => remainingOf(item) > 0);
  const valueOf = (item: PurchaseOrderItemRow) => lines[item.id] ?? remainingOf(item);

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
          onChange={(event) => setLines({ ...lines, [item.id]: Number(event.target.value) || 0 })}
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
            setError(errorMessage(issue));
          }
          setBusy(false);
        }}
      >
        {busy ? 'Enregistrement…' : 'Enregistrer la réception'}
      </Button>
    </Sheet>
  );
}
