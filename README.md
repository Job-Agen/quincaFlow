# Gestion de Boutique Générale

Application web de gestion pour boutique généraliste (alimentation, boissons, hygiène, papeterie, électronique…). Elle couvre le quotidien d'un commerce de détail : stock, caisse, achats fournisseurs, crédits clients, dépenses, comptabilité et facturation — le tout en français.

Les données sont **synchronisées de façon sécurisée sur Neon Serverless Postgres** après connexion (sauvegarde cloud, accès multi-appareils), avec repli en stockage local si Neon n'est pas configuré.

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
- Backend : [Neon](https://neon.tech/) (Serverless Postgres) + Auth API Next.js avec sessions JWT & bcrypt
- Persistance locale (cache hors-ligne / repli) : `localStorage` via le wrapper `src/storage/index.js` (clés préfixées `qp_`)
- Tests unitaires avec [Vitest](https://vitest.dev/) (environnement jsdom)

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseignez votre DATABASE_URL Neon
npm run dev                  # http://localhost:3000
```

### Configuration Neon Postgres

1. Créez un projet sur [neon.tech](https://neon.tech/).
2. Copiez la chaîne de connexion PostgreSQL (`postgres://...`).
3. Exécutez le script `schema.sql` dans l'éditeur SQL de Neon pour créer les tables (`users`, `products`, `contacts`, `sales`, `expenses`, `invoices`, `stock_movements`, `purchases`, `credit_payments`, `settings`).
4. Renseignez la variable dans `.env.local` :
   ```
   DATABASE_URL=postgres://user:password@ep-xyz.neon.tech/neondb?sslmode=require
   JWT_SECRET=votre-cle-secrete-session
   ```

À la première utilisation, créez un compte via l'écran de connexion (e-mail + mot de passe). Sans variable `DATABASE_URL`, l'application fonctionne en mode 100 % local (sans connexion).

Autres commandes :

```bash
npm run lint      # vérification ESLint
npm test          # tests unitaires (vitest run)
npm run build     # build de production
```

## Données & sauvegarde

Après connexion, vos données sont **enregistrées sur votre base Neon Postgres** : elles sont sauvegardées dans le cloud et disponibles depuis n'importe quel appareil après connexion. Le `localStorage` du navigateur sert de cache local.

**Conseil : conservez aussi une sauvegarde locale.** Dans **Paramètres → Données → Exporter (JSON)**, téléchargez une copie complète (`boutique-sauvegarde-AAAA-MM-JJ.json`), restaurable via **Importer**.
