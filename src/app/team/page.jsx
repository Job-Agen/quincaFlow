'use client';

import { useState } from 'react';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Button, Card, CardHead, Empty, Notice, Sheet, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';

/**
 * Équipe de la quincaillerie (§5).
 *
 * Le vendeur a son propre compte : sans cela il travaille sous celui du patron,
 * et l'historique ne peut plus dire qui a encaissé. Le premier mot de passe est
 * fixé ici et remis de vive voix — tant qu'aucun envoi d'e-mail n'est branché,
 * c'est la seule transmission honnête. Le vendeur le change ensuite lui-même
 * depuis Paramètres.
 */
export default function TeamPage() {
  const { isOwner } = useSession();
  const members = useResource('/api/members');
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const rows = members.data || [];

  async function remove(member) {
    setError(null);
    try {
      await api.delete(`/api/members/${member.id}`);
      setNotice(`${member.name} n'a plus accès à la boutique.`);
      members.reload();
    } catch (issue) {
      setError(issue.message);
    }
  }

  return (
    <>
      <AppBar back="/more" title="Équipe" />

      <main className="page">
        {!isOwner ? (
          <Notice tone="warn">Seul le propriétaire gère les comptes de la boutique.</Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <Card>
          <CardHead title="Comptes" />
          {rows.length === 0 ? (
            <Empty title="Aucun compte" hint="Ajoutez un vendeur pour qu'il ait son accès." />
          ) : (
            <div className="list">
              {rows.map((member) => (
                <div key={member.id} className="list__row">
                  <div className="list__body">
                    <div className="list__title">{member.name}</div>
                    <div className="list__sub">
                      {member.email}
                      {member.phone ? ` · ${member.phone}` : ''}
                    </div>
                  </div>
                  <span className={`badge badge--${member.role === 'OWNER' ? 'blue' : 'grey'}`}>
                    {member.role === 'OWNER' ? 'Propriétaire' : 'Vendeur'}
                  </span>
                  {isOwner && member.role !== 'OWNER' ? (
                    <>
                      <button
                        type="button"
                        className="appbar__icon"
                        aria-label={`Changer le mot de passe de ${member.name}`}
                        onClick={() => setResetting(member)}
                      >
                        <KeyRound size={18} className="muted" />
                      </button>
                      <button
                        type="button"
                        className="appbar__icon"
                        style={{ color: 'var(--red)' }}
                        aria-label={`Retirer ${member.name}`}
                        onClick={() => remove(member)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        {isOwner ? (
          <Button variant="success" block onClick={() => setInviting(true)}>
            <UserPlus size={18} />
            Ajouter un vendeur
          </Button>
        ) : null}

        <p className="small muted" style={{ marginTop: 6 }}>
          Un vendeur encaisse, enregistre les ventes hors stock et consulte le catalogue. Créer un
          produit, changer un prix, commander chez un fournisseur ou annuler une vente restent
          réservés au propriétaire.
        </p>
      </main>

      <SellerSheet
        open={inviting}
        onClose={() => setInviting(false)}
        onDone={(name) => {
          setInviting(false);
          setNotice(`${name} peut se connecter avec le mot de passe que vous lui avez remis.`);
          members.reload();
        }}
      />

      <ResetSheet
        member={resetting}
        onClose={() => setResetting(null)}
        onDone={(name) => {
          setResetting(null);
          setNotice(`Nouveau mot de passe remis à ${name}. Ses sessions ont été fermées.`);
        }}
      />
    </>
  );
}

function SellerSheet({ open, onClose, onDone }) {
  const empty = { name: '', email: '', phone: '', password: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/members', form);
      const { name } = form;
      setForm(empty);
      onDone(name);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Ajouter un vendeur" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <TextField label="Nom" placeholder="Ama Doe" value={form.name} onChange={set('name')} />
      <TextField
        label="Adresse e-mail"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        placeholder="ama@exemple.tg"
        hint="Elle lui servira d'identifiant."
        value={form.email}
        onChange={set('email')}
      />
      <TextField
        label="Téléphone (optionnel)"
        type="tel"
        inputMode="tel"
        value={form.phone}
        onChange={set('phone')}
      />
      <TextField
        label="Premier mot de passe"
        hint="À lui remettre de vive voix. Il pourra le changer ensuite."
        value={form.password}
        onChange={set('password')}
      />
      <Button block variant="success" disabled={busy} onClick={submit}>
        {busy ? 'Création…' : 'Créer le compte'}
      </Button>
    </Sheet>
  );
}

function ResetSheet({ member, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/members/${member.id}`, { password });
      setPassword('');
      onDone(member.name);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(member)} title="Nouveau mot de passe" onClose={onClose}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p className="small muted">
        À utiliser quand {member?.name} a perdu le sien. Ses sessions ouvertes seront fermées.
      </p>
      <TextField
        label="Mot de passe"
        hint="Au moins 8 caractères."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Button block disabled={busy} onClick={submit}>
        {busy ? 'Modification…' : 'Remettre ce mot de passe'}
      </Button>
    </Sheet>
  );
}
