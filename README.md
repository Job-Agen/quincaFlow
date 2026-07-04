# Gestion de Boutique Générale

Application web de gestion pour boutique généraliste (alimentation, boissons, hygiène, papeterie, électronique…). Elle couvre le quotidien d'un commerce de détail : stock, caisse, achats fournisseurs, crédits clients, dépenses, comptabilité et facturation — le tout en français et sans serveur : les données restent dans votre navigateur.

## Fonctionnalités par module

- **Tableau de bord** : chiffre d'affaires, ventes du jour, alertes de stock bas, créances clients, graphiques d'activité.
- **Stock** : catalogue produits (catégorie, unité, prix d'achat/vente, seuil d'alerte), ajustements avec motif et journal des mouvements (entrées, sorties, ajustements).
- **Caisse** : panier de vente, paiements en espèces, mobile money ou crédit (rattaché à un client), historique du jour avec annulation de vente et restitution du stock.
- **Achats** : commandes fournisseurs, réception qui met à jour le stock et le prix d'achat, suivi des commandes en attente.
- **Crédits** : suivi des créances clients, encaissement des remboursements, historique des paiements.
- **Dépenses** : saisie par catégorie, répartition mensuelle et liste filtrable par mois.
- **Comptabilité** : rapports par période (CA, marge brute, dépenses, achats, bénéfice net), encaissements par mode de paiement, impression du bilan.
- **Contacts** : clients et fournisseurs, coordonnées et soldes de crédit.
- **Facturation** : création de factures numérotées (FAC-AAAA-NNNN), suivi des statuts et des paiements, impression.
- **Paramètres** : nom, slogan et devise de la boutique ; catégories produits/dépenses et unités personnalisables ; export/import JSON et réinitialisation des données.

## Stack technique

- [Next.js 15](https://nextjs.org/) (App Router) + React 18 — JavaScript, sans TypeScript
- Styles inline avec un thème sombre ambre (`src/constants/theme.js`)
- [lucide-react](https://lucide.dev/) pour les icônes, [recharts](https://recharts.org/) pour les graphiques
- Persistance : `localStorage` du navigateur via le wrapper `src/storage/index.js` (clés préfixées `qp_`)
- Tests unitaires avec [Vitest](https://vitest.dev/) (environnement jsdom)

## Démarrage

```bash
npm install
npm run dev       # http://localhost:3000
```

Autres commandes :

```bash
npm run lint      # vérification ESLint
npm test          # tests unitaires (vitest run)
npm run build     # build de production
```

Au premier lancement, des données de démonstration (produits, ventes, contacts, dépenses) sont créées automatiquement si le stock est vide.

## Important : stockage local des données

Toutes les données sont stockées **localement dans votre navigateur** (localStorage). Elles ne sont envoyées sur aucun serveur, mais cela implique :

- les données sont liées à un navigateur et un appareil précis ;
- vider les données de navigation (cache/site data) **efface définitivement** la boutique ;
- la navigation privée ne conserve rien après fermeture.

**Conseil : faites un export régulier.** Rendez-vous dans **Paramètres → Données → Exporter (JSON)** pour télécharger une sauvegarde complète (`boutique-sauvegarde-AAAA-MM-JJ.json`), que vous pourrez restaurer à tout moment via **Importer**.
