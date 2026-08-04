'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, Printer, Trash2, CheckCircle, Plus, X, ChevronDown } from 'lucide-react';
import useInvoices from '../hooks/useInvoices';
import storage from '../storage';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { fmt } from '../utils/formatCurrency';
import { formatDate } from '../utils/dateHelpers';
import { Z } from '../constants/theme';

const C = {
  bg: '#0D0905',
  card: '#1A1008',
  card2: '#221408',
  amber: '#F5A623',
  terra: '#D4622A',
  green: '#2EAA6B',
  red: '#D93B2A',
  blue: '#3A8FD4',
  text: '#F5EDD8',
  muted: '#8B7B64',
  border: '#362210',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Wide Modal (supports maxWidth) ──────────────────────────────────────────
function WideModal({ open, onClose, title, children, maxWidth = 520 }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z.modal,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '14px',
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px 24px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: C.text,
              fontFamily: 'Syne, sans-serif',
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: C.muted,
              fontSize: '22px',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Article Autocomplete Input ───────────────────────────────────────────────
function ArticleInput({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const wrapRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }
    const products = storage.get('qp_products', []);
    const filtered = products
      .filter((p) => p.name && p.name.toLowerCase().startsWith(val.toLowerCase()))
      .slice(0, 5);
    setSuggestions(filtered);
    setShowSug(filtered.length > 0);
  };

  useEffect(() => {
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSug(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const inputStyle = {
    background: C.card2,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    padding: '9px 10px',
    color: C.text,
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 2, minWidth: 0 }}>
      <input
        value={value}
        onChange={handleChange}
        placeholder="Nom de l'article"
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = C.amber)}
        onBlur={(e) => (e.target.style.borderColor = C.border)}
      />
      {showSug && (
        <ul
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            zIndex: 300,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            margin: 0,
            padding: '4px 0',
            listStyle: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {suggestions.map((p, i) => (
            <li
              key={i}
              onMouseDown={() => {
                onSelect(p);
                setShowSug(false);
              }}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.card2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: C.text, fontSize: '13px', fontWeight: 600 }}>{p.name}</span>
              {(p.sellPrice !== undefined || p.unitPrice !== undefined) && (
                <span style={{ color: C.muted, fontSize: '12px' }}>
                  {fmt(p.sellPrice ?? p.unitPrice)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Invoice Form Modal ───────────────────────────────────────────────────────
function InvoiceFormModal({ open, onClose, onSave, editInvoice }) {
  const today = todayISO();
  const blankForm = {
    clientContact: '',
    clientName: '',
    clientPhone: '',
    clientAddress: '',
    date: today,
    dueDate: addDays(today, 30),
    items: [{ name: '', qty: 1, unitPrice: 0 }],
    discount: 0,
    notes: '',
  };

  const [form, setForm] = useState(blankForm);
  const contacts = storage.get('qp_contacts', []).filter((c) => c.type === 'client');

  useEffect(() => {
    if (!open) return;
    if (editInvoice) {
      setForm({
        clientContact: '',
        clientName: editInvoice.clientName || '',
        clientPhone: editInvoice.clientPhone || '',
        clientAddress: editInvoice.clientAddress || '',
        date: editInvoice.date || today,
        dueDate: editInvoice.dueDate || addDays(today, 30),
        items: editInvoice.items?.length ? editInvoice.items : [{ name: '', qty: 1, unitPrice: 0 }],
        discount: editInvoice.discount || 0,
        notes: editInvoice.notes || '',
      });
    } else {
      setForm(blankForm);
    }
  }, [open]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleContactSelect = (e) => {
    const id = e.target.value;
    if (!id) {
      set('clientContact', '');
      return;
    }
    const c = contacts.find((c) => c.id === id);
    if (c) {
      setForm((f) => ({
        ...f,
        clientContact: id,
        clientName: c.name || '',
        clientPhone: c.phone || '',
        clientAddress: c.address || '',
      }));
    }
  };

  const updateItem = (idx, field, val) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx ? { ...it, [field]: field === 'name' ? val : Number(val) } : it
      ),
    }));
  };

  const addItem = () =>
    setForm((f) => ({ ...f, items: [...f.items, { name: '', qty: 1, unitPrice: 0 }] }));
  const removeItem = (idx) => {
    if (form.items.length <= 1) return;
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const subtotal = form.items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0
  );
  const discountAmt = subtotal * ((Number(form.discount) || 0) / 100);
  const total = subtotal - discountAmt;

  const handleSave = () => {
    if (!form.clientName.trim()) {
      alert('Le nom du client est requis.');
      return;
    }
    if (form.items.some((it) => !it.name.trim())) {
      alert('Tous les articles doivent avoir un nom.');
      return;
    }
    onSave({
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      clientAddress: form.clientAddress.trim(),
      date: form.date,
      dueDate: form.dueDate,
      items: form.items,
      subtotal,
      discount: Number(form.discount) || 0,
      total,
      notes: form.notes,
    });
  };

  const inputStyle = {
    background: C.card2,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    padding: '9px 12px',
    color: C.text,
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    outline: 'none',
  };
  const labelSt = {
    fontSize: '13px',
    color: C.muted,
    fontWeight: 500,
    marginBottom: '5px',
    display: 'block',
  };
  const sectionHd = {
    fontSize: '12px',
    fontWeight: 700,
    color: C.amber,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    margin: '22px 0 12px',
    paddingBottom: '7px',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={editInvoice ? 'Modifier la facture' : 'Nouvelle facture'}
      maxWidth={760}
    >
      {/* ── Client ── */}
      <div style={sectionHd}>
        <span>Client</span>
      </div>

      {contacts.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelSt}>Sélectionner un client existant</label>
          <select
            value={form.clientContact}
            onChange={handleContactSelect}
            style={{
              ...inputStyle,
              appearance: 'none',
              cursor: 'pointer',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B7B64' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '32px',
            }}
            onFocus={(e) => (e.target.style.borderColor = C.amber)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          >
            <option value="">-- Ou saisir manuellement --</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id} style={{ background: C.card2 }}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="responsive-grid cols-2" style={{ gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={labelSt}>Nom client *</label>
          <input
            style={inputStyle}
            value={form.clientName}
            placeholder="Nom du client"
            onChange={(e) => set('clientName', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = C.amber)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
        </div>
        <div>
          <label style={labelSt}>Téléphone</label>
          <input
            style={inputStyle}
            value={form.clientPhone}
            placeholder="+224 XXX XXX XXX"
            onChange={(e) => set('clientPhone', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = C.amber)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
        </div>
      </div>
      <div>
        <label style={labelSt}>Adresse</label>
        <input
          style={inputStyle}
          value={form.clientAddress}
          placeholder="Adresse du client"
          onChange={(e) => set('clientAddress', e.target.value)}
          onFocus={(e) => (e.target.style.borderColor = C.amber)}
          onBlur={(e) => (e.target.style.borderColor = C.border)}
        />
      </div>

      {/* ── Dates ── */}
      <div style={sectionHd}>
        <span>Dates</span>
      </div>
      <div className="responsive-grid cols-2" style={{ gap: '12px' }}>
        <div>
          <label style={labelSt}>Date de facture</label>
          <input
            type="date"
            style={inputStyle}
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = C.amber)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
        </div>
        <div>
          <label style={labelSt}>Date d'échéance</label>
          <input
            type="date"
            style={inputStyle}
            value={form.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = C.amber)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
        </div>
      </div>

      {/* ── Articles ── */}
      <div style={{ ...sectionHd, marginTop: '22px' }}>
        <span>Articles</span>
        <Button variant="secondary" size="sm" onClick={addItem}>
          <Plus size={13} /> Ajouter une ligne
        </Button>
      </div>

      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 110px 90px 30px',
          gap: '6px',
          marginBottom: '6px',
          padding: '0 2px',
        }}
      >
        <span style={{ fontSize: '11px', color: C.muted }}>Article</span>
        <span style={{ fontSize: '11px', color: C.muted, textAlign: 'center' }}>Qté</span>
        <span style={{ fontSize: '11px', color: C.muted, textAlign: 'right' }}>Prix unit.</span>
        <span style={{ fontSize: '11px', color: C.muted, textAlign: 'right' }}>Sous-total</span>
        <span />
      </div>

      {form.items.map((item, idx) => {
        const lineTotal = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
        const numStyle = {
          background: C.card2,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '9px 8px',
          color: C.text,
          fontSize: '13px',
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          outline: 'none',
          textAlign: 'center',
        };
        return (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 110px 90px 30px',
              gap: '6px',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <ArticleInput
              value={item.name}
              onChange={(val) => updateItem(idx, 'name', val)}
              onSelect={(p) => {
                setForm((f) => ({
                  ...f,
                  items: f.items.map((it, i) =>
                    i === idx
                      ? { ...it, name: p.name, unitPrice: p.sellPrice ?? p.unitPrice ?? 0 }
                      : it
                  ),
                }));
              }}
            />
            <input
              type="number"
              min="1"
              value={item.qty}
              onChange={(e) => updateItem(idx, 'qty', e.target.value)}
              style={numStyle}
              onFocus={(e) => (e.target.style.borderColor = C.amber)}
              onBlur={(e) => (e.target.style.borderColor = C.border)}
            />
            <input
              type="number"
              min="0"
              value={item.unitPrice}
              onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
              style={{ ...numStyle, textAlign: 'right' }}
              onFocus={(e) => (e.target.style.borderColor = C.amber)}
              onBlur={(e) => (e.target.style.borderColor = C.border)}
            />
            <span
              style={{ fontSize: '13px', color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}
            >
              {fmt(lineTotal)}
            </span>
            <button
              onClick={() => removeItem(idx)}
              disabled={form.items.length <= 1}
              style={{
                background: 'none',
                border: 'none',
                cursor: form.items.length <= 1 ? 'not-allowed' : 'pointer',
                color: form.items.length <= 1 ? C.border : C.red,
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: form.items.length <= 1 ? 0.3 : 1,
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      {/* ── Totaux ── */}
      <div style={{ ...sectionHd, marginTop: '22px' }}>
        <span>Totaux</span>
      </div>
      <div style={{ background: C.card2, borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ color: C.muted, fontSize: '14px' }}>Sous-total</span>
          <span style={{ color: C.text, fontWeight: 600, fontSize: '14px' }}>{fmt(subtotal)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            gap: '12px',
          }}
        >
          <label style={{ color: C.muted, fontSize: '14px', flexShrink: 0 }}>Remise (%)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min="0"
              max="100"
              value={form.discount}
              onChange={(e) => set('discount', Math.min(100, Math.max(0, Number(e.target.value))))}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '6px 10px',
                color: C.text,
                fontSize: '14px',
                width: '70px',
                textAlign: 'center',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = C.amber)}
              onBlur={(e) => (e.target.style.borderColor = C.border)}
            />
            <span style={{ color: C.muted, fontSize: '13px' }}>%</span>
            <span
              style={{ color: C.terra, fontSize: '13px', minWidth: '80px', textAlign: 'right' }}
            >
              -{fmt(discountAmt)}
            </span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '10px',
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <span
            style={{
              color: C.amber,
              fontSize: '17px',
              fontWeight: 800,
              fontFamily: 'Syne, sans-serif',
            }}
          >
            TOTAL HT
          </span>
          <span style={{ color: C.amber, fontSize: '22px', fontWeight: 800 }}>{fmt(total)}</span>
        </div>
      </div>

      {/* ── Notes ── */}
      <div style={{ ...sectionHd, marginTop: '22px' }}>
        <span>Notes</span>
      </div>
      <textarea
        value={form.notes}
        onChange={(e) => set('notes', e.target.value)}
        placeholder="Notes libres, conditions de paiement, instructions..."
        rows={3}
        style={{
          background: C.card2,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '10px 12px',
          color: C.text,
          fontSize: '14px',
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          outline: 'none',
          resize: 'vertical',
        }}
        onFocus={(e) => (e.target.style.borderColor = C.amber)}
        onBlur={(e) => (e.target.style.borderColor = C.border)}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Enregistrer
        </Button>
      </div>
    </WideModal>
  );
}

// ─── Status Update Modal ──────────────────────────────────────────────────────
function StatusModal({ open, onClose, invoice, onSave }) {
  const [status, setStatus] = useState('en attente');
  const [amountPaid, setAmountPaid] = useState(0);

  useEffect(() => {
    if (open && invoice) {
      setStatus(invoice.status || 'en attente');
      setAmountPaid(invoice.amountPaid || 0);
    }
  }, [open, invoice]);

  const handleSave = () => {
    const paid = status === 'payée' ? invoice?.total || 0 : Number(amountPaid);
    onSave({ status, amountPaid: paid });
  };

  return (
    <Modal open={open} onClose={onClose} title="Mettre à jour le statut">
      <div style={{ marginBottom: '16px' }}>
        <Select
          label="Statut"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'en attente', label: 'En attente' },
            { value: 'partielle', label: 'Paiement partiel' },
            { value: 'payée', label: 'Payée' },
          ]}
        />
      </div>
      {status === 'partielle' && (
        <div style={{ marginBottom: '16px' }}>
          <Input
            label="Montant déjà payé (FCFA)"
            type="number"
            min="0"
            max={invoice?.total}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
        </div>
      )}
      {invoice && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            background: '#221408',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#8B7B64', fontSize: '13px' }}>Total facture</span>
          <span style={{ color: '#F5EDD8', fontWeight: 700 }}>{fmt(invoice.total)}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Enregistrer
        </Button>
      </div>
    </Modal>
  );
}

// ─── Print Preview Modal ──────────────────────────────────────────────────────
function PrintModal({ open, onClose, invoice }) {
  if (!invoice) return null;
  const remaining = Math.max(0, (invoice.total || 0) - (invoice.amountPaid || 0));

  return (
    <WideModal open={open} onClose={onClose} title="Aperçu / Impression" maxWidth={700}>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 18mm; } }`}</style>

      <div
        className="no-print"
        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}
      >
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={15} /> Imprimer
        </Button>
      </div>

      {/* White document */}
      <div
        style={{
          background: '#fff',
          color: '#111',
          borderRadius: '8px',
          padding: '36px 32px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Doc header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '28px',
          }}
        >
          <div>
            <div
              style={{ fontSize: '24px', fontWeight: 900, color: '#111', letterSpacing: '0.02em' }}
            >
              QUINCAILPRO
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
              Magasin de matériaux de construction
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#111' }}>{invoice.number}</div>
            <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
              Date : {formatDate(invoice.date)}
            </div>
            <div style={{ fontSize: '13px', color: '#555' }}>
              Échéance : {formatDate(invoice.dueDate)}
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '0 0 22px' }} />

        {/* Client */}
        <div style={{ marginBottom: '26px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              color: '#999',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            FACTURÉ À
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#111' }}>
            {invoice.clientName}
          </div>
          {invoice.clientPhone && (
            <div style={{ fontSize: '13px', color: '#444', marginTop: '3px' }}>
              {invoice.clientPhone}
            </div>
          )}
          {invoice.clientAddress && (
            <div style={{ fontSize: '13px', color: '#444', marginTop: '2px' }}>
              {invoice.clientAddress}
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '0 0 16px' }} />

        {/* Items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '22px' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {['Article', 'Qté', 'Prix unit.', 'Total'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '9px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#555',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '9px 10px', fontSize: '14px', color: '#111' }}>
                  {item.name}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    fontSize: '14px',
                    color: '#111',
                    textAlign: 'center',
                  }}
                >
                  {item.qty}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    fontSize: '14px',
                    color: '#111',
                    textAlign: 'right',
                  }}
                >
                  {fmt(item.unitPrice)}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#111',
                    textAlign: 'right',
                  }}
                >
                  {fmt((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '0 0 16px' }} />

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '270px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>Sous-total</span>
              <span style={{ fontSize: '13px', color: '#111', fontWeight: 500 }}>
                {fmt(invoice.subtotal)}
              </span>
            </div>
            {invoice.discount > 0 && (
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}
              >
                <span style={{ fontSize: '13px', color: '#666' }}>
                  Remise ({invoice.discount}%)
                </span>
                <span style={{ fontSize: '13px', color: '#c0392b' }}>
                  -{fmt((invoice.subtotal || 0) * (invoice.discount / 100))}
                </span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '2.5px solid #111',
                borderBottom: '2.5px solid #111',
                margin: '8px 0',
              }}
            >
              <span style={{ fontSize: '17px', fontWeight: 900, color: '#111' }}>TOTAL</span>
              <span style={{ fontSize: '17px', fontWeight: 900, color: '#111' }}>
                {fmt(invoice.total)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>Payé</span>
              <span style={{ fontSize: '13px', color: '#27ae60', fontWeight: 700 }}>
                {fmt(invoice.amountPaid || 0)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: remaining > 0 ? '#c0392b' : '#27ae60',
                }}
              >
                RESTE À PAYER
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: remaining > 0 ? '#c0392b' : '#27ae60',
                }}
              >
                {fmt(remaining)}
              </span>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '20px 0 14px' }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '12px', color: '#888' }}>Statut : </span>
            <span
              style={{
                fontWeight: 800,
                fontSize: '13px',
                color:
                  invoice.status === 'payée'
                    ? '#27ae60'
                    : invoice.status === 'partielle'
                      ? '#2980b9'
                      : '#e67e22',
              }}
            >
              {(invoice.status || 'EN ATTENTE').toUpperCase()}
            </span>
          </div>
          {invoice.notes && (
            <div style={{ maxWidth: '55%', textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#888',
                  marginBottom: '3px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Notes
              </div>
              <div style={{ fontSize: '12px', color: '#444', fontStyle: 'italic' }}>
                {invoice.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </WideModal>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }) {
  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: '11px',
          color: C.muted,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 800,
          color,
          fontFamily: 'Syne, sans-serif',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Facturation() {
  const { invoices, addInvoice, updateInvoice, deleteInvoice, markPaid } = useInvoices();
  const [filterStatus, setFilterStatus] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [statusModal, setStatusModal] = useState(null);

  // KPIs
  const totalFacture = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalEncaisse = invoices.reduce((s, i) => s + (i.amountPaid || 0), 0);
  const totalEnAttente = invoices
    .filter((i) => i.status === 'en attente' || i.status === 'partielle')
    .reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.amountPaid || 0)), 0);

  const tabs = [
    { key: 'all', label: 'Toutes', count: invoices.length },
    {
      key: 'en attente',
      label: 'En attente',
      count: invoices.filter((i) => i.status === 'en attente').length,
    },
    {
      key: 'partielle',
      label: 'Partielles',
      count: invoices.filter((i) => i.status === 'partielle').length,
    },
    { key: 'payée', label: 'Payées', count: invoices.filter((i) => i.status === 'payée').length },
  ];

  const filtered = invoices
    .filter((i) => filterStatus === 'all' || i.status === filterStatus)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const handleSaveInvoice = (data) => {
    if (editInvoice) {
      updateInvoice(editInvoice.id, data);
    } else {
      addInvoice(data);
    }
    setFormOpen(false);
    setEditInvoice(null);
  };

  const handleStatusSave = ({ status, amountPaid }) => {
    updateInvoice(statusModal.id, { status, amountPaid });
    setStatusModal(null);
  };

  const handleDelete = (inv) => {
    if (window.confirm(`Supprimer la facture ${inv.number} ?`)) {
      deleteInvoice(inv.id);
    }
  };

  const statusBadge = (status) => {
    if (status === 'payée') return <Badge variant="success">Payée</Badge>;
    if (status === 'partielle') return <Badge variant="info">Partielle</Badge>;
    return <Badge variant="warning">En attente</Badge>;
  };

  return (
    <div className="page-container">
      <div>
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '28px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '30px',
              fontWeight: 800,
              color: C.amber,
              fontFamily: 'Syne, sans-serif',
            }}
          >
            Facturation
          </h1>
          <Button
            variant="primary"
            onClick={() => {
              setEditInvoice(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} /> Nouvelle facture
          </Button>
        </div>

        {/* ── KPIs ── */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <KpiCard label="Total facturé" value={fmt(totalFacture)} color={C.amber} />
          <KpiCard label="Encaissé" value={fmt(totalEncaisse)} color={C.green} />
          <KpiCard label="En attente" value={fmt(totalEnAttente)} color={C.terra} />
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const active = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 600,
                  transition: 'all 0.15s',
                  background: active ? C.amber : C.card2,
                  color: active ? '#0D0905' : C.muted,
                }}
              >
                {tab.label}
                <span style={{ marginLeft: '6px', opacity: 0.7 }}>({tab.count})</span>
              </button>
            );
          })}
        </div>

        {/* ── Invoice List ── */}
        {filtered.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.muted }}>
              <div style={{ fontSize: '44px', marginBottom: '14px' }}>🧾</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>Aucune facture</div>
              <div style={{ fontSize: '13px', marginTop: '6px' }}>
                {filterStatus === 'all'
                  ? 'Créez votre première facture en cliquant sur « Nouvelle facture ».'
                  : 'Aucune facture dans cette catégorie.'}
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((inv) => (
              <Card key={inv.id} style={{ padding: '14px 18px' }}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  {/* Left block */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '18px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {/* Number + date */}
                    <div style={{ minWidth: '110px' }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: C.amber,
                          fontFamily: 'Syne, sans-serif',
                        }}
                      >
                        {inv.number}
                      </div>
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                        {formatDate(inv.date)}
                      </div>
                    </div>

                    {/* Client */}
                    <div style={{ flex: 1, minWidth: '100px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>
                        {inv.clientName}
                      </div>
                      {inv.clientPhone && (
                        <div style={{ fontSize: '12px', color: C.muted }}>{inv.clientPhone}</div>
                      )}
                    </div>

                    {/* Due date */}
                    <div style={{ minWidth: '80px' }}>
                      <div style={{ fontSize: '11px', color: C.muted }}>Échéance</div>
                      <div style={{ fontSize: '13px', color: C.text }}>
                        {formatDate(inv.dueDate)}
                      </div>
                    </div>

                    {/* Amount */}
                    <div style={{ minWidth: '100px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.text }}>
                        {fmt(inv.total)}
                      </div>
                      {(inv.amountPaid || 0) > 0 && inv.status !== 'payée' && (
                        <div style={{ fontSize: '12px', color: C.green }}>
                          Payé : {fmt(inv.amountPaid)}
                        </div>
                      )}
                    </div>

                    {/* Badge */}
                    {statusBadge(inv.status)}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setPrintInvoice(inv)}
                      title="Voir / Imprimer"
                      style={{
                        background: C.card2,
                        border: `1px solid ${C.border}`,
                        borderRadius: '7px',
                        cursor: 'pointer',
                        color: C.muted,
                        padding: '7px 9px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      onClick={() => setStatusModal(inv)}
                      title="Modifier le statut"
                      style={{
                        background: C.card2,
                        border: `1px solid ${C.border}`,
                        borderRadius: '7px',
                        cursor: 'pointer',
                        color: C.blue,
                        padding: '7px 9px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <ChevronDown size={15} />
                    </button>
                    {inv.status !== 'payée' && (
                      <button
                        onClick={() => markPaid(inv.id)}
                        title="Marquer payée"
                        style={{
                          background: C.green,
                          border: 'none',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          color: '#fff',
                          padding: '7px 11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          fontWeight: 700,
                          fontFamily: 'inherit',
                        }}
                      >
                        <CheckCircle size={13} /> Payée
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(inv)}
                      title="Supprimer"
                      style={{
                        background: 'rgba(217,59,42,0.1)',
                        border: '1px solid rgba(217,59,42,0.3)',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        color: C.red,
                        padding: '7px 9px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <InvoiceFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditInvoice(null);
        }}
        onSave={handleSaveInvoice}
        editInvoice={editInvoice}
      />
      <StatusModal
        open={!!statusModal}
        onClose={() => setStatusModal(null)}
        invoice={statusModal}
        onSave={handleStatusSave}
      />
      <PrintModal
        open={!!printInvoice}
        onClose={() => setPrintInvoice(null)}
        invoice={printInvoice}
      />
    </div>
  );
}
