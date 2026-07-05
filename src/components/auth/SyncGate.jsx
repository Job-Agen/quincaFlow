'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, getSupabase } from '../../lib/supabaseClient';
import { onStorageChange } from '../../storage';
import { pullAll, pushKey, clearLocalData } from '../../lib/sync';
import { configForKey } from '../../lib/syncConfig';
import { COLORS, FONTS } from '../../constants/theme';
import LoginView from './LoginView';

const SessionContext = createContext({ user: null, configured: false, signOut: () => {} });

export function useSession() {
  return useContext(SessionContext);
}

function Splash({ label }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '14px',
        background: COLORS.bg,
        color: COLORS.muted,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          border: `3px solid ${COLORS.border}`,
          borderTopColor: COLORS.amber,
          borderRadius: '50%',
          animation: 'qp-spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: '14px' }}>{label}</span>
      <style>{`@keyframes qp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SyncGate({ children }) {
  const configured = isSupabaseConfigured();
  // undefined = en cours de détermination, null = déconnecté, objet = connecté
  const [session, setSession] = useState(configured ? undefined : null);
  const [hydrated, setHydrated] = useState(false);

  // Suivi de la session d'authentification.
  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') clearLocalData();
      setSession(s ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  // Hydratation depuis Supabase + miroir des écritures locales, quand connecté.
  useEffect(() => {
    if (!configured) return;
    if (!session) {
      setHydrated(false);
      return;
    }

    const userId = session.user.id;
    let cancelled = false;
    const timers = new Map();

    // On enregistre le miroir AVANT l'hydratation (l'hydratation écrit en silencieux).
    const unsub = onStorageChange((key, value) => {
      if (!configForKey(key)) return;
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          pushKey(key, value, userId);
        }, 400)
      );
    });

    (async () => {
      await pullAll(userId);
      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
      unsub();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [configured, session]);

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  };

  // Mode local (Supabase non configuré) : comportement historique, sans login.
  if (!configured) {
    return (
      <SessionContext.Provider value={{ user: null, configured: false, signOut }}>
        {children}
      </SessionContext.Provider>
    );
  }

  if (session === undefined) return <Splash label="Chargement…" />;
  if (session === null) return <LoginView />;
  if (!hydrated) return <Splash label="Synchronisation de vos données…" />;

  return (
    <SessionContext.Provider value={{ user: session.user, configured: true, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
