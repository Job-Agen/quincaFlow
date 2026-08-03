'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAuthUser, logoutUser } from '../../lib/neonClient';
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
  const [user, setUser] = useState(undefined); // undefined = vérification en cours, null = non connecté
  const [configured, setConfigured] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const checkSession = useCallback(async () => {
    const res = await getAuthUser();
    setConfigured(res.configured);
    setUser(res.user);
  }, []);

  // Détermination initiale de la session utilisateur
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Hydratation depuis Neon + miroir des écritures locales quand connecté
  useEffect(() => {
    if (!configured || !user) {
      return;
    }

    let cancelled = false;
    const timers = new Map();

    const unsub = onStorageChange((key, value) => {
      if (!configForKey(key)) return;
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          pushKey(key, value);
        }, 400)
      );
    });

    (async () => {
      await pullAll();
      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
      unsub();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [configured, user]);

  const handleSignOut = async () => {
    await logoutUser();
    clearLocalData();
    setUser(null);
    setHydrated(false);
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  // Mode 100% local (Neon non configuré)
  if (!configured && user === null) {
    return (
      <SessionContext.Provider value={{ user: null, configured: false, signOut: handleSignOut }}>
        {children}
      </SessionContext.Provider>
    );
  }

  if (user === undefined) return <Splash label="Chargement…" />;
  if (user === null) return <LoginView onSessionSuccess={handleLoginSuccess} />;
  if (!hydrated) return <Splash label="Synchronisation de vos données avec Neon…" />;

  return (
    <SessionContext.Provider value={{ user, configured: true, signOut: handleSignOut }}>
      {children}
    </SessionContext.Provider>
  );
}
