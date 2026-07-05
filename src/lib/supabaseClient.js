'use client';

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Vrai si les variables d'environnement Supabase sont présentes.
 * Sinon, l'application retombe en mode 100 % local (localStorage), sans login.
 */
export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

let client = null;

/**
 * Client Supabase navigateur (singleton). Retourne null si non configuré.
 */
export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export default getSupabase;
