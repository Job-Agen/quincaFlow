'use client';

import React, { useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';
import { COLORS, FONTS } from '../../constants/theme';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function LoginView() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase non configuré.');
      return;
    }
    if (!email || !password) {
      setError('Renseignez un e-mail et un mot de passe.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        // Si la confirmation e-mail est requise, aucune session n'est créée.
        if (!data.session) {
          setInfo('Compte créé. Vérifiez votre e-mail si une confirmation est demandée, puis connectez-vous.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(traduireErreur(err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: COLORS.bg,
        padding: '20px',
        fontFamily: FONTS.body,
        color: COLORS.text,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '16px',
          padding: '32px 28px',
        }}
      >
        <h1
          style={{
            fontFamily: FONTS.heading,
            fontSize: '26px',
            margin: 0,
            color: COLORS.amber,
            letterSpacing: '-0.5px',
          }}
        >
          Ma Boutique
        </h1>
        <p style={{ color: COLORS.muted, marginTop: '6px', marginBottom: '24px', fontSize: '14px' }}>
          {mode === 'signin' ? 'Connexion à votre boutique' : 'Créer un compte boutique'}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            autoComplete="email"
          />
          <Input
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />

          {error && (
            <div style={{ color: COLORS.red, fontSize: '13px', lineHeight: 1.4 }}>{error}</div>
          )}
          {info && (
            <div style={{ color: COLORS.green, fontSize: '13px', lineHeight: 1.4 }}>{info}</div>
          )}

          <Button type="submit" size="lg" disabled={loading} style={{ justifyContent: 'center', marginTop: '4px' }}>
            {loading ? 'Veuillez patienter…' : mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
          </Button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: COLORS.muted }}>
          {mode === 'signin' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setInfo('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.amber,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 600,
              padding: 0,
            }}
          >
            {mode === 'signin' ? 'Créer un compte' : 'Se connecter'}
          </button>
        </div>
      </div>
    </div>
  );
}

function traduireErreur(msg) {
  if (!msg) return 'Une erreur est survenue.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('already registered')) return 'Cet e-mail est déjà utilisé.';
  if (m.includes('email not confirmed')) return 'E-mail non confirmé. Vérifiez votre boîte mail.';
  return msg;
}
