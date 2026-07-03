import './globals.css';
import AppShell from '../components/layout/AppShell';
import SeedData from '../components/layout/SeedData';

export const metadata = {
  title: 'QuincailPro',
  description: 'Gestion de boutique',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@800&family=DM+Sans:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SeedData />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
