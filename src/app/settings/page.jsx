'use client';

import { useState } from 'react';
import { KeyRound, Store } from 'lucide-react';
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
    maxSellerDiscountPercent: business?.max_seller_discount_percent ?? 10,
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
              <TextField
                label="Remise max. d'un vendeur (%)"
                hint="Au-delà, seul le propriétaire peut valider la vente. 0 fige les tarifs."
                type="number"
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                value={form.maxSellerDiscountPercent}
                onChange={set('maxSellerDiscountPercent')}
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

        <PasswordCard />
      </main>
    </>
  );
}

/**
 * Changement de mot de passe.
 *
 * Séparé du formulaire de la boutique : ce sont deux gestes sans rapport, et
 * mêler un secret à des coordonnées d'affichage inviterait à enregistrer l'un
 * en croyant modifier l'autre. Accessible à tous, propriétaire ou vendeur —
 * chacun est responsable de son propre accès.
 */
function PasswordCard() {
  const empty = { currentPassword: '', newPassword: '', confirmation: '' };
  const [form, setForm] = useState(empty);
  const [state, setState] = useState({ busy: false, error: null, done: false });

  const set = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value });
    setState((current) => ({ ...current, done: false }));
  };

  async function submit(event) {
    event.preventDefault();
    if (form.newPassword !== form.confirmation) {
      setState({ busy: false, error: 'Les deux saisies ne correspondent pas.', done: false });
      return;
    }
    setState({ busy: true, error: null, done: false });
    try {
      await api.patch('/api/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm(empty);
      setState({ busy: false, error: null, done: true });
    } catch (issue) {
      setState({ busy: false, error: issue.message, done: false });
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 22 }}>
      <Card>
        <CardHead title="Mot de passe" action={<KeyRound size={18} className="muted" />} />
        <div className="stack" style={{ padding: 16 }}>
          {state.error ? <Notice tone="error">{state.error}</Notice> : null}
          {state.done ? (
            <Notice>
              Mot de passe modifié. Les sessions ouvertes sur vos autres appareils ont été fermées.
            </Notice>
          ) : null}

          <TextField
            label="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={set('currentPassword')}
            required
          />
          <TextField
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            hint="Au moins 8 caractères."
            value={form.newPassword}
            onChange={set('newPassword')}
            required
          />
          <TextField
            label="Confirmer le nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            value={form.confirmation}
            onChange={set('confirmation')}
            required
          />
          <Button block type="submit" disabled={state.busy}>
            {state.busy ? 'Modification…' : 'Changer le mot de passe'}
          </Button>
        </div>
      </Card>
    </form>
  );
}
