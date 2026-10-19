'use client';

import { useState, type ChangeEvent } from 'react';
import { Button, Notice, Sheet, TextAreaField, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { errorMessage } from '@/utils/errors';
import type { ContactRow } from '@/types';

/**
 * Fiche en cours d'édition. `isNew` n'existe qu'à l'écran : il distingue une
 * création d'une modification, là où la fiche n'a pas encore d'identifiant.
 */
export type EditingContact = Partial<ContactRow> & { isNew?: boolean };

/**
 * Formulaire d'une fiche de répertoire, en feuille.
 *
 * Il vit à part de l'écran de liste depuis que la fiche client (§45) l'ouvre
 * elle aussi : le crayon de la fiche et le « + » du répertoire doivent modifier
 * le même formulaire, sans quoi un champ ajouté d'un côté manquerait de l'autre.
 */
export default function ContactSheet({
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
