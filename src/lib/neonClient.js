'use client';

/**
 * Client pour communiquer avec les API de l'application QuincailPro (Neon Postgres & Auth).
 */

export async function getAuthUser() {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return { user: null, configured: false };
    return await res.json();
  } catch {
    return { user: null, configured: false };
  }
}

export async function loginUser(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur de connexion');
  return data;
}

export async function signupUser(email, password) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur d’inscription');
  return data;
}

export async function logoutUser() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignorer
  }
}
