import { neon } from '@neondatabase/serverless';

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
}

/**
 * Retourne vrai si la base de données Neon est configurée via variable d'environnement.
 */
export function isDbConfigured() {
  return Boolean(getDatabaseUrl());
}

/**
 * Retourne une instance de client SQL Neon (ou null si non configuré).
 */
export function getDb() {
  const url = getDatabaseUrl();
  if (!url) return null;
  return neon(url);
}

export default getDb;
