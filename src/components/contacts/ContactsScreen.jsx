'use client';

import { useState } from 'react';
import { Phone, Plus, Users } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Button,
  Card,
  Empty,
  Notice,
  SearchField,
  Sheet,
  Skeleton,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';

/**
 * Écran de répertoire, partagé par les clients et les fournisseurs (§18, §23).
 *
 * Les deux fiches ne diffèrent que d'un champ — le WhatsApp du fournisseur —
 * et se comportent à l'identique. Deux écrans jumeaux divergeraient au premier
 * correctif ; un seul, paramétré, ne le peut pas.
 */
export default function ContactsScreen({ kind, title, addLabel, withWhatsapp, emptyHint }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useResource(`/api/${kind}`, { search });

  return (
    <>
      <AppBar back="/more" title={title} />

      <main className="page">
        <SearchField value={search} onChange={setSearch} placeholder="Nom ou téléphone…" />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={64} /> : null}

        {data ? (
          <Card>
            {data.length === 0 ? (
              <Empty
                icon={<Users size={26} className="muted" />}
                title="Répertoire vide"
                hint={emptyHint}
              />
            ) : (
              <div className="list">
                {data.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className="list__row"
                    onClick={() => setEditing(contact)}
                  >
                    <span className="thumb" style={{ fontWeight: 800, color: 'var(--blue-dark)' }}>
                      {contact.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="list__body">
                      <div className="list__title">{contact.name}</div>
                      {contact.phone ? (
                        <div className="list__sub">
                          <Phone size={12} style={{ verticalAlign: -1 }} /> {contact.phone}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        ) : null}
      </main>

      <button
        type="button"
        className="fab"
        aria-label={addLabel}
        onClick={() => setEditing({ isNew: true })}
      >
        <Plus size={26} />
      </button>

      {editing ? (
        <ContactSheet
          kind={kind}
          contact={editing}
          withWhatsapp={withWhatsapp}
          addLabel={addLabel}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function ContactSheet({ kind, contact, withWhatsapp, addLabel, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: contact.name || '',
    phone: contact.phone || '',
    whatsapp: contact.whatsapp || '',
    address: contact.address || '',
    notes: contact.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (contact.isNew) await api.post(`/api/${kind}`, form);
      else await api.patch(`/api/${kind}/${contact.id}`, form);
      onSaved();
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
    }
  }

  return (
    <Sheet open title={contact.isNew ? addLabel : form.name} onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <TextField label="Nom" value={form.name} onChange={set('name')} required />
      <TextField
        label="Téléphone"
        type="tel"
        inputMode="tel"
        value={form.phone}
        onChange={set('phone')}
      />
      {withWhatsapp ? (
        <TextField
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          value={form.whatsapp}
          onChange={set('whatsapp')}
        />
      ) : null}
      <TextField label="Adresse" value={form.address} onChange={set('address')} />
      <TextAreaField label="Notes" rows={2} value={form.notes} onChange={set('notes')} />
      <Button block disabled={busy || !form.name.trim()} onClick={save}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </Sheet>
  );
}
