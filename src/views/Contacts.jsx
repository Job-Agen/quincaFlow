'use client';

import React, { useState } from 'react';
import { Edit2, Trash2, CreditCard, Plus, Search, User, Building2 } from 'lucide-react';
import useContacts from '../hooks/useContacts';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { fmt } from '../utils/formatCurrency';

const COLORS = {
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

const EMPTY_FORM = {
  name: '',
  phone: '',
  address: '',
  type: 'client',
};

export default function Contacts() {
  const { contacts, addContact, updateContact, deleteContact, updateCredit } = useContacts();

  const [activeTab, setActiveTab] = useState('client');
  const [search, setSearch] = useState('');

  // Form modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Credit modal state
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditContact, setCreditContact] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');

  // --- Filtered list ---
  const filtered = contacts.filter(
    (c) => c.type === activeTab && c.name.toLowerCase().includes(search.toLowerCase())
  );

  const clientCount = contacts.filter((c) => c.type === 'client').length;
  const fournisseurCount = contacts.filter((c) => c.type === 'fournisseur').length;

  // --- Form handlers ---
  function openAdd() {
    setEditingContact(null);
    setForm({ ...EMPTY_FORM, type: activeTab });
    setModalOpen(true);
  }

  function openEdit(contact) {
    setEditingContact(contact);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      address: contact.address || '',
      type: contact.type || 'client',
    });
    setModalOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    if (editingContact) {
      updateContact(editingContact.id, form);
    } else {
      addContact(form);
    }
    setModalOpen(false);
  }

  function handleDelete(contact) {
    if (window.confirm(`Supprimer "${contact.name}" ?`)) {
      deleteContact(contact.id);
    }
  }

  // --- Credit handlers ---
  function openCredit(contact) {
    setCreditContact(contact);
    setCreditAmount('');
    setCreditModalOpen(true);
  }

  function handleCreditIncrease() {
    const delta = parseFloat(creditAmount);
    if (!isNaN(delta) && delta > 0) {
      updateCredit(creditContact.id, delta);
    }
    setCreditModalOpen(false);
  }

  function handleCreditDecrease() {
    const delta = parseFloat(creditAmount);
    if (!isNaN(delta) && delta > 0) {
      updateCredit(creditContact.id, -delta);
    }
    setCreditModalOpen(false);
  }

  // --- Tab style helper ---
  function tabStyle(tab) {
    const isActive = activeTab === tab;
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '9px 20px',
      background: isActive ? COLORS.amber : 'transparent',
      color: isActive ? '#0D0905' : COLORS.muted,
      border: isActive ? 'none' : `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '14px',
      fontFamily: 'inherit',
      transition: 'all 0.15s',
    };
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '28px',
            fontWeight: 700,
            color: COLORS.amber,
            fontFamily: 'Syne, sans-serif',
          }}
        >
          Contacts
        </h1>
        <Button variant="primary" onClick={openAdd}>
          <Plus size={16} />
          Ajouter un contact
        </Button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={tabStyle('client')} onClick={() => setActiveTab('client')}>
          <User size={15} />
          Clients
          <span
            style={{
              background: activeTab === 'client' ? 'rgba(0,0,0,0.2)' : COLORS.card2,
              color: activeTab === 'client' ? '#0D0905' : COLORS.muted,
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {clientCount}
          </span>
        </button>
        <button style={tabStyle('fournisseur')} onClick={() => setActiveTab('fournisseur')}>
          <Building2 size={15} />
          Fournisseurs
          <span
            style={{
              background: activeTab === 'fournisseur' ? 'rgba(0,0,0,0.2)' : COLORS.card2,
              color: activeTab === 'fournisseur' ? '#0D0905' : COLORS.muted,
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {fournisseurCount}
          </span>
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: COLORS.muted,
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          placeholder="Rechercher par nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: COLORS.card2,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '8px',
            padding: '9px 12px 9px 36px',
            color: COLORS.text,
            fontSize: '14px',
            fontFamily: 'inherit',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Contact List */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: COLORS.muted,
            fontSize: '15px',
          }}
        >
          {search
            ? 'Aucun contact trouvé pour cette recherche.'
            : `Aucun ${activeTab} enregistré. Cliquez sur "Ajouter un contact".`}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {filtered.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => openEdit(contact)}
              onDelete={() => handleDelete(contact)}
              onCredit={() => openCredit(contact)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingContact ? 'Modifier le contact' : 'Ajouter un contact'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Nom"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nom complet"
          />
          <Input
            label="Téléphone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+226 XX XX XX XX"
          />
          <Input
            label="Adresse"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Quartier, ville..."
          />
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            options={[
              { value: 'client', label: 'Client' },
              { value: 'fournisseur', label: 'Fournisseur' },
            ]}
          />
          {editingContact && editingContact.type === 'client' && (
            <Input
              label="Crédit actuel"
              value={fmt(editingContact.creditBalance || 0)}
              readOnly
              style={{ opacity: 0.7 }}
            />
          )}
          <div
            style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}
          >
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!form.name.trim()}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Credit Adjustment Modal */}
      <Modal
        open={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        title="Ajuster le crédit"
      >
        {creditContact && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: COLORS.card2,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '10px',
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: '13px', color: COLORS.muted, marginBottom: '4px' }}>
                Crédit actuel de {creditContact.name}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: COLORS.blue }}>
                {fmt(creditContact.creditBalance || 0)}
              </div>
            </div>
            <Input
              label="Montant"
              type="number"
              min="0"
              step="1"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Ex: 5000"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <Button
                variant="secondary"
                onClick={handleCreditIncrease}
                disabled={!creditAmount || parseFloat(creditAmount) <= 0}
                style={{ justifyContent: 'center' }}
              >
                Augmenter le crédit (+)
              </Button>
              <Button
                variant="danger"
                onClick={handleCreditDecrease}
                disabled={!creditAmount || parseFloat(creditAmount) <= 0}
                style={{ justifyContent: 'center' }}
              >
                Marquer payé (−)
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCreditModalOpen(false)}
                style={{ justifyContent: 'center' }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// --- Sub-component: individual contact card ---
function ContactCard({ contact, onEdit, onDelete, onCredit }) {
  const isClient = contact.type === 'client';
  const hasCredit = isClient && (contact.creditBalance || 0) > 0;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Name + type badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: '16px',
              color: COLORS.amber,
              fontFamily: 'Syne, sans-serif',
              marginBottom: '2px',
            }}
          >
            {contact.name}
          </div>
          {!isClient && <Badge variant="neutral">Fournisseur</Badge>}
        </div>
        {isClient &&
          (hasCredit ? (
            <Badge variant="info">{fmt(contact.creditBalance)}</Badge>
          ) : (
            <Badge variant="success">Aucun crédit</Badge>
          ))}
      </div>

      {/* Contact info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {contact.phone && (
          <div style={{ fontSize: '13px', color: COLORS.muted }}>
            <span style={{ marginRight: '6px' }}>📞</span>
            {contact.phone}
          </div>
        )}
        {contact.address && (
          <div style={{ fontSize: '13px', color: COLORS.muted }}>
            <span style={{ marginRight: '6px' }}>📍</span>
            {contact.address}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          paddingTop: '8px',
          borderTop: `1px solid ${COLORS.border}`,
          flexWrap: 'wrap',
        }}
      >
        <ActionBtn
          icon={<Edit2 size={14} />}
          label="Modifier"
          onClick={onEdit}
          color={COLORS.amber}
        />
        <ActionBtn
          icon={<Trash2 size={14} />}
          label="Supprimer"
          onClick={onDelete}
          color={COLORS.red}
        />
        {isClient && (
          <ActionBtn
            icon={<CreditCard size={14} />}
            label="Crédit"
            onClick={onCredit}
            color={COLORS.blue}
          />
        )}
      </div>
    </Card>
  );
}

function ActionBtn({ icon, label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 10px',
        background: 'transparent',
        border: `1px solid ${color}30`,
        borderRadius: '6px',
        color: color,
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = `${color}15`)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  );
}
