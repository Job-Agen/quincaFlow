'use client';

import { useState, type ChangeEvent } from 'react';
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
import { useSession } from '@/client/session';
import type { ContactRow } from '@/types';
import { errorMessage } from '@/utils/errors';

/**
 * Fiche en cours d'édition. `isNew` n'existe qu'à l'écran : il distingue une
 * création d'une modification, là où la fiche n'a pas encore d'identifiant.
 */
type EditingContact = Partial<ContactRow> & { isNew?: boolean };

/**
 * Écran de répertoire, partagé par les clients et les fournisseurs (§18, §23).
 *
 * Les deux fiches ne diffèrent que d'un champ — le WhatsApp du fournisseur —
 * et se comportent à l'identique. Deux écrans jumeaux divergeraient au premier
 * correctif ; un seul, paramétré, ne le peut pas.
 */
export default function ContactsScreen({
  kind,
  title,
  addLabel,
  withWhatsapp,
  emptyHint,
  ownerOnly = false,
}: {
  kind: 'customers' | 'suppliers';
  title: string;
  addLabel: string;
  withWhatsapp?: boolean;
  emptyHint?: string;
  /** Réserve l'écriture au propriétaire : vrai pour les fournisseurs (§5). */
  ownerOnly?: boolean;
}) {
  const [search, setSearch] = useState('');
  // `null` : aucune fiche ouverte. Un objet vide : création d'une nouvelle fiche.
  const [editing, setEditing] = useState<EditingContact | null>(null);
  const { data, loading, error, reload } = useResource<ContactRow[]>(`/api/${kind}`, { search });
  const { isOwner } = useSession();

  // Un vendeur inscrit un client au comptoir, mais ne touche pas au répertoire
  // fournisseurs : c'est avec eux que l'argent sort. L'écran est le même, le
  // droit d'écriture non — d'où le réglage porté par l'appelant.
  const canEdit = !ownerOnly || isOwner;

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
                    disabled={!canEdit}
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

      {canEdit ? (
        <button
          type="button"
          className="fab"
          aria-label={addLabel}
          onClick={() => setEditing({ isNew: true })}
        >
          <Plus size={26} />
        </button>
      ) : null}

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

function ContactSheet({
  kind,
  contact,
  withWhatsapp,
  addLabel,
  onClose,
  onSaved,
}: {
  kind: 'customers' | 'suppliers';
  contact: EditingContact;
  withWhatsapp?: boolean;
  addLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: contact.name || '',
    phone: contact.phone || '',
    whatsapp: contact.whatsapp || '',
    address: contact.address || '',
    notes: contact.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [field]: event.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (contact.isNew) await api.post(`/api/${kind}`, form);
      else await api.patch(`/api/${kind}/${contact.id}`, form);
      onSaved();
    } catch (issue) {
      setError(errorMessage(issue));
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
