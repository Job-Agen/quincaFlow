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
    // `camera=(self)`, et non `camera=()` : une liste vide interdit la caméra à
    // la page elle-même, ce qui faisait échouer le scan de code-barres (§9) avec
    // un refus du navigateur plutôt qu'un refus de l'utilisateur. La photo d'un
    // reçu (§40) passe, elle, par un champ de fichier et n'était pas concernée.
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
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
