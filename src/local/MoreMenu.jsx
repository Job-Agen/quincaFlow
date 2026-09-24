'use client';
import {
  ChevronRight,
  Users,
  Truck,
  ShoppingCart,
  ChartNoAxesCombined,
  Settings,
  Download,
  UserCog,
  CircleHelp,
  History,
  ArrowLeftRight,
  LogOut,
} from 'lucide-react';
import { Section } from './views';
import { Button } from './ui';
export function MoreMenu({ data, navigate, signOut, role }) {
  const groups = [
    [
      'Commerce',
      [
        ['Clients et crédits', 'customers', Users, 'Fiches clients, dettes et remboursements'],
        ['Fournisseurs', 'suppliers', Truck, 'Contacts et règlements'],
        [
          'Achats et commandes',
          'purchases',
          ShoppingCart,
          'Approvisionnements et commandes fournisseurs',
        ],
        ['Ventes hors stock', '/out-of-stock', ArrowLeftRight, 'Achats chez un autre vendeur'],
      ],
    ],
    [
      'Suivi de l’activité',
      [
        ['Rapports', 'reports', ChartNoAxesCombined, 'Ventes, marges et rentabilité'],
        ['Historique des opérations', '/history', History, 'Ventes, commandes et réceptions'],
      ],
    ],
    [
      'Gestion de la boutique',
      [
        ['Paramètres', '/settings', Settings, 'Coordonnées, factures et compte'],
        [
          'Sauvegarde et soldes initiaux',
          'backup',
          Download,
          'Exporter les données et préparer le hors ligne',
        ],
        ...(role === 'OWNER' ? [['Équipe', '/team', UserCog, 'Accès des vendeurs']] : []),
        ['Aide', '/help', CircleHelp, 'Utiliser l’application'],
      ],
    ],
  ];
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>Plus</h1>
          <p>{data.shop.name} · Tous les outils de votre boutique.</p>
        </div>
      </div>
      <div className="local-columns">
        {groups.map(([title, items]) => (
          <Section title={title} key={title}>
            {items.map(([label, target, Icon, hint]) => {
              const content = (
                <>
                  <Icon size={21} />
                  <span className="local-row-main">
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                  <ChevronRight size={18} />
                </>
              );
              return target.startsWith('/') ? (
                <a key={label} className="local-row local-click" href={target}>
                  {content}
                </a>
              ) : (
                <button
                  key={label}
                  className="local-row local-click"
                  onClick={() => navigate(target)}
                >
                  {content}
                </button>
              );
            })}
          </Section>
        ))}
      </div>
      <Button tone="ghost" onClick={signOut}>
        <LogOut size={18} />
        Se déconnecter
      </Button>
    </>
  );
}
