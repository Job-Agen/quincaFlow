import './globals.css';
import './prototype.css';
import { SessionProvider } from '@/client/session';
import AppShell from '@/components/layout/AppShell';
import ServiceWorker from '@/components/layout/ServiceWorker';

export const metadata = {
  title: 'MaQuincaillerie — gestion de quincaillerie',
  description: 'Ventes, stock, ventes hors stock et achats fournisseurs, pour les quincailleries.',
  applicationName: 'MaQuincaillerie',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  /**
   * iOS ignore le manifeste : le plein écran, le titre et la couleur de la barre
   * d'état ne s'obtiennent que par ces balises `apple-mobile-web-app-*`. Sans
   * elles, « Ajouter à l'écran d'accueil » n'ouvre qu'un onglet Safari déguisé.
   */
  appleWebApp: {
    capable: true,
    title: 'MaQuincaillerie',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  /**
   * Next émet la balise moderne `mobile-web-app-capable`, comprise par iOS 15.4
   * et au-delà. Les iPhone plus anciens, encore courants, n'ouvrent en plein
   * écran que sur la balise préfixée : elle est donc ajoutée à la main.
   */
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

/** Le thème du navigateur suit la barre d'application : pas de bande blanche en haut. */
export const viewport = {
  themeColor: '#0b4e86',
  width: 'device-width',
  initialScale: 1,
  // Le zoom reste permis : un gérant presbyte doit pouvoir agrandir un montant.
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
