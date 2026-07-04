'use client';

import { useState, useMemo } from 'react';
import { HandCoins, Users, Trash2, Receipt, History } from 'lucide-react';

import useContacts from '../hooks/useContacts';
import useCredits from '../hooks/useCredits';
import { useSales } from '../hooks/useSales';
import { fmt } from '../utils/formatCurrency';
import { formatDate, formatTime } from '../utils/dateHelpers';
import { COLORS, FONTS } from '../constants/theme';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';

const C = COLORS;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: '13px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: C.muted,
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {children}
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        background: C.card,
        border: '1px solid ' + C.border,
        borderRadius: '12px',
        padding: '16px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div
      style={{
        background: C.card2,
        border: '1px solid ' + C.border,
        borderRadius: '12px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        minWidth: '200px',
        flex: 1,
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'rgba(245,166,35,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={20} color={accent} />
      </div>
      <div>
        <div
          style={{
            fontSize: '11px',
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: accent, marginTop: '2px' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Credits() {
  const { contacts, updateCredit } = useContacts();
  const { payments, addPayment, deletePayment } = useCredits();
  const { sales } = useSales();

  // ── Encaissement modal ──────────────────────────────────────────────────────
  const [collectTarget, setCollectTarget] = useState(null); // contact
  const [collectAmount, setCollectAmount] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectError, setCollectError] = useState('');

  // ── Suppression remboursement modal ─────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null); // payment

  // ── Filtre traçabilité ──────────────────────────────────────────────────────
  const [clientFilter, setClientFilter] = useState('');

  // ── Derived data ────────────────────────────────────────────────────────────
  const clients = useMemo(() => contacts.filter((c) => c.type === 'client'), [contacts]);

  const debtors = useMemo(
    () =>
      clients
        .filter((c) => (c.creditBalance || 0) > 0)
        .sort((a, b) => (b.creditBalance || 0) - (a.creditBalance || 0)),
    [clients]
  );

  const totalReceivables = useMemo(
    () => clients.reduce((sum, c) => sum + (c.creditBalance || 0), 0),
    [clients]
  );

  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [payments]
  );

  const creditSales = useMemo(
    () =>
      sales
        .filter((s) => s.payment === 'crédit' && s.status !== 'annulée')
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [sales]
  );

  const creditClientNames = useMemo(() => {
    const names = new Set();
    creditSales.forEach((s) => names.add(s.clientName || 'Client anonyme'));
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [creditSales]);

  const groupedCreditSales = useMemo(() => {
    const filtered = clientFilter
      ? creditSales.filter((s) => (s.clientName || 'Client anonyme') === clientFilter)
      : creditSales;
    const map = new Map();
    filtered.forEach((s) => {
      const key = s.clientName || 'Client anonyme';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return [...map.entries()].map(([name, list]) => ({
      name,
      list,
      subtotal: list.reduce((sum, s) => sum + (s.total || 0), 0),
    }));
  }, [creditSales, clientFilter]);

  function contactName(contactId) {
    const c = contacts.find((ct) => ct.id === contactId);
    return c ? c.name : 'Client supprimé';
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  function openCollect(contact) {
    setCollectTarget(contact);
    setCollectAmount('');
    setCollectNote('');
    setCollectError('');
  }

  function closeCollect() {
    setCollectTarget(null);
    setCollectAmount('');
    setCollectNote('');
    setCollectError('');
  }

  function handleCollect(e) {
    e.preventDefault();
    if (!collectTarget) return;
    const amount = Number(collectAmount);
    const balance = collectTarget.creditBalance || 0;
    if (!collectAmount || isNaN(amount) || amount <= 0) {
      setCollectError('Le montant doit être un nombre positif.');
      return;
    }
    if (amount > balance) {
      setCollectError('Le montant ne peut pas dépasser le solde dû (' + fmt(balance) + ').');
      return;
    }
    addPayment({ contactId: collectTarget.id, amount, note: collectNote.trim() });
    updateCredit(collectTarget.id, -amount);
    closeCollect();
  }

  function handleDeletePayment() {
    if (!deleteTarget) return;
    deletePayment(deleteTarget.id);
    updateCredit(deleteTarget.contactId, +deleteTarget.amount);
    setDeleteTarget(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <div>
        {/* ── HEADER + KPI ─────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: FONTS.heading,
                fontSize: '28px',
                fontWeight: 800,
                color: C.amber,
                margin: 0,
              }}
            >
              Crédits clients
            </h1>
            <p style={{ color: C.muted, fontSize: '13px', margin: '4px 0 0' }}>
              Suivi des créances et encaissement des remboursements
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <Kpi
            icon={HandCoins}
            label="Total des créances"
            value={fmt(totalReceivables)}
            accent={C.amber}
          />
          <Kpi
            icon={Users}
            label="Débiteurs"
            value={String(debtors.length)}
            accent={C.terra}
          />
        </div>

        {/* ── DÉBITEURS + HISTORIQUE ───────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            alignItems: 'start',
            marginBottom: '24px',
          }}
        >
          {/* Clients débiteurs */}
          <Panel>
            <SectionTitle>
              <HandCoins size={14} color={C.amber} />
              Clients débiteurs
            </SectionTitle>
            {debtors.length === 0 ? (
              <p
                style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '16px 0' }}
              >
                Aucune créance en cours.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {debtors.map((client) => (
                  <div
                    key={client.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      background: C.card2,
                      borderRadius: '8px',
                      border: '1px solid ' + C.border,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>
                        {client.name}
                      </div>
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                        {client.phone || 'Téléphone non renseigné'}
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: 800,
                        color: C.terra,
                        fontSize: '15px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fmt(client.creditBalance)}
                    </span>
                    <Button variant="green" size="sm" onClick={() => openCollect(client)}>
                      <HandCoins size={13} />
                      Encaisser
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Historique des remboursements */}
          <Panel>
            <SectionTitle>
              <History size={14} color={C.green} />
              Historique des remboursements
            </SectionTitle>
            {sortedPayments.length === 0 ? (
              <p
                style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '16px 0' }}
              >
                Aucun remboursement enregistré.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '420px',
                  overflowY: 'auto',
                }}
              >
                {sortedPayments.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      background: C.card2,
                      borderRadius: '8px',
                      border: '1px solid ' + C.border,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        color: C.muted,
                        whiteSpace: 'nowrap',
                        minWidth: '110px',
                      }}
                    >
                      {formatDate(p.date)} {formatTime(p.date)}
                    </span>
                    <span
                      style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: C.text, minWidth: '80px' }}
                    >
                      {contactName(p.contactId)}
                    </span>
                    {p.note && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: C.muted,
                          fontStyle: 'italic',
                          maxWidth: '160px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={p.note}
                      >
                        {p.note}
                      </span>
                    )}
                    <span
                      style={{
                        fontWeight: 700,
                        color: C.green,
                        whiteSpace: 'nowrap',
                        fontSize: '14px',
                      }}
                    >
                      + {fmt(p.amount)}
                    </span>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      title="Supprimer ce remboursement"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: C.muted,
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '6px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── TRAÇABILITÉ DES VENTES À CRÉDIT ──────────── */}
        <Panel>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <SectionTitle>
              <Receipt size={14} color={C.blue} />
              Ventes à crédit (traçabilité)
            </SectionTitle>
            <div style={{ minWidth: '200px' }}>
              <Select
                label="Filtrer par client"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                options={[
                  { value: '', label: 'Tous les clients' },
                  ...creditClientNames.map((n) => ({ value: n, label: n })),
                ]}
              />
            </div>
          </div>

          {groupedCreditSales.length === 0 ? (
            <p style={{ color: C.muted, fontSize: '14px', textAlign: 'center', margin: '16px 0' }}>
              Aucune vente à crédit enregistrée.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {groupedCreditSales.map((group) => (
                <div key={group.name}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>
                      {group.name}
                    </span>
                    <Badge variant="warning">
                      {group.list.length} vente{group.list.length !== 1 ? 's' : ''}
                    </Badge>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: C.amber }}>
                      {fmt(group.subtotal)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {group.list.map((sale) => (
                      <div
                        key={sale.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: C.card2,
                          borderRadius: '8px',
                          border: '1px solid ' + C.border,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>
                          {formatDate(sale.date)} {formatTime(sale.date)}
                        </span>
                        <span style={{ flex: 1, fontSize: '12px', color: C.muted, minWidth: '100px' }}>
                          {(sale.items || []).length} article
                          {(sale.items || []).length !== 1 ? 's' : ''}
                        </span>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: C.amber,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fmt(sale.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ══ MODAL — ENCAISSER UN REMBOURSEMENT ══ */}
      <Modal
        open={!!collectTarget}
        onClose={closeCollect}
        title={'Encaisser — ' + (collectTarget?.name || '')}
      >
        <form onSubmit={handleCollect}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: C.card,
              border: '1px solid ' + C.border,
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.muted }}>Solde dû</span>
            <span style={{ fontSize: '22px', fontWeight: 900, color: C.terra }}>
              {fmt(collectTarget?.creditBalance || 0)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Input
              label="Montant encaissé"
              type="number"
              min="1"
              step="1"
              placeholder="0"
              value={collectAmount}
              onChange={(e) => {
                setCollectAmount(e.target.value);
                setCollectError('');
              }}
              required
            />
            <Input
              label="Note (optionnel)"
              type="text"
              placeholder="Ex : acompte, règlement partiel…"
              value={collectNote}
              onChange={(e) => setCollectNote(e.target.value)}
            />
          </div>

          {collectError && (
            <p style={{ color: C.red, fontSize: '13px', margin: '10px 0 0' }}>{collectError}</p>
          )}

          <div
            style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}
          >
            <Button type="button" variant="ghost" size="md" onClick={closeCollect}>
              Annuler
            </Button>
            <Button type="submit" variant="green" size="md">
              <HandCoins size={15} />
              Encaisser
            </Button>
          </div>
        </form>
      </Modal>

      {/* ══ MODAL — SUPPRIMER UN REMBOURSEMENT ══ */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer le remboursement"
      >
        <p style={{ color: C.text, fontSize: '15px', lineHeight: 1.6, marginTop: 0 }}>
          Supprimer le remboursement de{' '}
          <strong style={{ color: C.amber }}>{fmt(deleteTarget?.amount || 0)}</strong> de{' '}
          <strong>{deleteTarget ? contactName(deleteTarget.contactId) : ''}</strong> ? Le montant
          sera recrédité sur son solde de créance.
        </p>
        <div
          style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}
        >
          <Button variant="ghost" size="md" onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button variant="danger" size="md" onClick={handleDeletePayment}>
            <Trash2 size={15} />
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
