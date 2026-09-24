import './globals.css';
import './prototype.css';
import ClientRoot from '@/components/layout/ClientRoot';

export const metadata = {
  title: 'QuincaFlow — gestion de quincaillerie',
  description: 'Ventes, stock, ventes hors stock et achats fournisseurs, pour les quincailleries.',
};

/** Le thème du navigateur suit la barre d'application : pas de bande blanche en haut. */
export const viewport = {
  themeColor: '#0b4e86',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
