import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/**
 * En-têtes de sécurité.
 *
 * L'application manipule les chiffres d'affaires de commerçants : elle ne doit
 * pouvoir être ni encadrée dans un site tiers, ni servir de source à un
 * renifleur de type MIME, ni laisser fuir l'adresse d'une facture dans le
 * `Referer` d'un lien sortant.
 *
 * HSTS n'est pas listé ici : Vercel le pose déjà sur ses domaines, et l'ajouter
 * en double sur un hébergement qui ne sert pas encore en HTTPS rendrait le site
 * injoignable le temps de la durée annoncée.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // L'en-tête par défaut annonce la technologie employée sans rien apporter.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
