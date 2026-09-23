'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import { Button, Notice, TextField } from '@/components/ui';

/**
 * Inscription (§7).
 *
 * Le formulaire crée d'un même geste le compte du gérant et sa quincaillerie :
 * ce sont les deux faces d'une même inscription, et rien d'utile ne peut être
 * fait tant que la seconde n'existe pas.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { setProfile } = useSession();
  const [form, setForm] = useState({
    ownerName: '',
    businessName: '',
    phone: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setProfile(await api.post('/api/auth/register', form));
      router.replace('/');
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth auth--register">
      <div className="auth__hero" style={{ minHeight: 150 }}>
        <h1 className="auth__brand">MaQuincaillerie</h1>
        <span className="auth__tagline">Créez votre quincaillerie en une minute</span>
      </div>

      <form className="auth__panel" onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}

        <TextField
          label="Nom de la quincaillerie"
          placeholder="Quincaillerie Bâtir Plus"
          value={form.businessName}
          onChange={set('businessName')}
          required
        />
        <TextField
          label="Votre nom"
          placeholder="Kossi Amegan"
          autoComplete="name"
          value={form.ownerName}
          onChange={set('ownerName')}
          required
        />
        <TextField
          label="Téléphone"
          type="tel"
          inputMode="tel"
          placeholder="+228 90 12 34 56"
          value={form.phone}
          onChange={set('phone')}
        />
        <TextField
          label="Adresse e-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="adresse@email.com"
          value={form.email}
          onChange={set('email')}
          required
        />
        <TextField
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          hint="8 caractères minimum."
          value={form.password}
          onChange={set('password')}
          required
        />

        <Button block type="submit" disabled={busy}>
          {busy ? 'Création…' : 'Créer mon compte'}
        </Button>

        <p className="small muted" style={{ textAlign: 'center' }}>
          Déjà inscrit ?{' '}
          <Link href="/login" className="link">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}
