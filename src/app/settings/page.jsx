'use client';

import { useState } from 'react';
import { Store } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Button, Card, CardHead, Notice, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';

/**
 * Paramètres de la boutique.
 *
 * Ces coordonnées ne sont pas décoratives : ce sont elles qui s'impriment en
 * tête de chaque facture remise au client (§15). Seul le propriétaire peut les
 * modifier — un vendeur n'a pas à changer l'identité qui figure sur les
 * documents.
 */
export default function SettingsPage() {
  const { business, isOwner, setProfile } = useSession();
  const [form, setForm] = useState(() => ({
    name: business?.name || '',
    tagline: business?.tagline || '',
    phone: business?.phone || '',
    address: business?.address || '',
    currency: business?.currency || 'FCFA',
  }));
  const [state, setState] = useState({ busy: false, error: null, saved: false });

  const set = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value });
    setState((current) => ({ ...current, saved: false }));
  };

  async function save(event) {
    event.preventDefault();
    setState({ busy: true, error: null, saved: false });
    try {
      setProfile(await api.patch('/api/business', form));
      setState({ busy: false, error: null, saved: true });
    } catch (issue) {
      setState({ busy: false, error: issue.message, saved: false });
    }
  }

  return (
    <>
      <AppBar back="/more" title="Paramètres" />

      <main className="page">
        {!isOwner ? (
          <Notice tone="warn">
            Seul le propriétaire peut modifier les informations de la boutique.
          </Notice>
        ) : null}
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state.saved ? <Notice>Modifications enregistrées.</Notice> : null}

        <form onSubmit={save}>
          <Card>
            <CardHead title="Ma quincaillerie" action={<Store size={18} className="muted" />} />
            <div className="stack" style={{ padding: 16 }}>
              <TextField
                label="Nom"
                value={form.name}
                onChange={set('name')}
                disabled={!isOwner}
                required
              />
              <TextField
                label="Slogan"
                placeholder="Tout pour construire, réparer, équiper"
                hint="Affiché sous le nom sur les factures."
                value={form.tagline}
                onChange={set('tagline')}
                disabled={!isOwner}
              />
              <TextField
                label="Adresse"
                placeholder="Avenue de l'Indépendance, Lomé"
                value={form.address}
                onChange={set('address')}
                disabled={!isOwner}
              />
              <TextField
                label="Téléphone"
                type="tel"
                inputMode="tel"
                placeholder="+228 90 12 34 56"
                value={form.phone}
                onChange={set('phone')}
                disabled={!isOwner}
              />
              <TextField
                label="Devise"
                hint="Symbole affiché après les montants."
                value={form.currency}
                onChange={set('currency')}
                disabled={!isOwner}
              />
            </div>
          </Card>

          {isOwner ? (
            <Button block type="submit" disabled={state.busy} style={{ marginTop: 14 }}>
              {state.busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          ) : null}
        </form>
      </main>
    </>
  );
}
