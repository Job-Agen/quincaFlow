# Gestion de Boutique Générale

Application web de gestion pour boutique généraliste (alimentation, boissons, hygiène, papeterie, électronique…). Elle couvre le quotidien d'un commerce de détail : stock, caisse, achats fournisseurs, crédits clients, dépenses, comptabilité et facturation — le tout en français.

Les données sont **synchronisées de façon sécurisée sur Supabase** après connexion (sauvegarde cloud, accès multi-appareils), avec repli en stockage local si Supabase n'est pas configuré.

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
- Backend : [Supabase](https://supabase.com/) (PostgreSQL + Auth), avec RLS par utilisateur
- Persistance locale (cache hors-ligne / repli) : `localStorage` via le wrapper `src/storage/index.js` (clés préfixées `qp_`)
- Tests unitaires avec [Vitest](https://vitest.dev/) (environnement jsdom)

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseignez vos clés Supabase
npm run dev                  # http://localhost:3000
```

### Configuration Supabase

1. Créez un projet sur [supabase.com](https://supabase.com/) (ou réutilisez le vôtre).
2. Dans **Project Settings → API**, copiez l'URL du projet et la clé *publishable* (`sb_publishable_…`).
3. Renseignez-les dans `.env.local` :
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_XXXXXXXX
   ```
4. Le schéma (tables `products`, `contacts`, `sales`, `expenses`, `invoices`, `stock_movements`, `purchases`, `credit_payments`, `settings`) est appliqué via les migrations Supabase. Chaque table est protégée par **Row Level Security** : un utilisateur n'accède qu'à ses propres données (`auth.uid() = user_id`).

À la première utilisation, créez un compte via l'écran de connexion (e-mail + mot de passe). Sans variables Supabase, l'application fonctionne en mode 100 % local (sans connexion), comme avant.

Autres commandes :

```bash
npm run lint      # vérification ESLint
npm test          # tests unitaires (vitest run)
npm run build     # build de production
```

Au premier lancement d'un nouveau compte, des données de démonstration (produits, ventes, contacts, dépenses) sont créées automatiquement si le stock est vide.

## Données & sauvegarde

Après connexion, vos données sont **enregistrées sur votre compte Supabase** : elles sont sauvegardées dans le cloud et disponibles depuis n'importe quel appareil après connexion. Le `localStorage` du navigateur sert de cache local (l'interface reste rapide et réactive).

**Conseil : conservez aussi une sauvegarde locale.** Dans **Paramètres → Données → Exporter (JSON)**, téléchargez une copie complète (`boutique-sauvegarde-AAAA-MM-JJ.json`), restaurable via **Importer**.
