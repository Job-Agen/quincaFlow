'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import { Button, Notice } from '@/components/ui';

/**
 * Écran de connexion (maquette 1).
 *
 * L'identifiant accepte indifféremment l'e-mail ou le téléphone : dans une
 * quincaillerie, le numéro est souvent la seule des deux coordonnées que le
 * gérant connaît par cœur.
 */
export default function LoginPage() {
  const router = useRouter();
  const { setProfile } = useSession();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setProfile(await api.post('/api/auth/login', form));
      router.replace('/local');
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__hero">
        <h1 className="auth__brand">MaQuincaillerie</h1>
        <span className="auth__tagline">
          Gérez simplement vos ventes, votre stock et vos fournisseurs
        </span>
      </div>

      <form className="auth__panel" onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="input-icon">
          <Mail size={17} />
          <input
            className="input"
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder="adresse@email.com ou téléphone"
            aria-label="Adresse e-mail ou téléphone"
            value={form.identifier}
            onChange={(event) => setForm({ ...form, identifier: event.target.value })}
            required
          />
        </div>

        <div className="input-icon">
          <Lock size={17} />
          <input
            className="input"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Mot de passe"
            aria-label="Mot de passe"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
          <button
            type="button"
            className="input-icon__action"
            aria-label={reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            onClick={() => setReveal((current) => !current)}
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <Button block type="submit" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </Button>

        <details className="auth-help">
          <summary>Mot de passe oublié ?</summary>
          <p>
            Si vous êtes vendeur, demandez au propriétaire de réinitialiser votre accès depuis la
            page Équipe. Pour un compte propriétaire, contactez l’administrateur de l’application.
          </p>
        </details>

        <p className="small muted" style={{ textAlign: 'center' }}>
          Pas encore de compte ?{' '}
          <Link href="/register" className="link">
            S&apos;inscrire
          </Link>
        </p>
      </form>
    </div>
  );
}
