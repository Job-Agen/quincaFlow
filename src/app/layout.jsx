import './globals.css';
import { SessionProvider } from '@/client/session';
import AppShell from '@/components/layout/AppShell';

export const metadata = {
  title: 'QuincaFlow — gestion de quincaillerie',
  description: 'Ventes, stock, ventes hors stock et achats fournisseurs, pour les quincailleries.',
};

/** Le thème du navigateur suit la barre d'application : pas de bande blanche en haut. */
export const viewport = {
  themeColor: '#134e8e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
