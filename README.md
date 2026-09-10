# QuincaFlow

Le cahier numérique d'une quincaillerie. QuincaFlow remplace le fonctionnement
dispersé entre cahier papier, calculatrice, WhatsApp et documents — sans
transformer le quotidien du commerçant en utilisation d'un ERP.

**La règle du produit :** une information saisie une fois met à jour tout ce qui
en dépend.

```
5 vitres × 450 FCFA = 2 250 FCFA
   ↓ validation
vente créée → stock −5 → CA +2 250 → marge calculée → historique → tableau de bord
```

SaaS multi-tenant, mobile d'abord, en français, en FCFA.

## Périmètre du MVP

| Module | Ce qu'il fait |
| --- | --- |
| **Tableau de bord** | Ventes, achats, marge brute et nombre de ventes du jour, ventes hors stock, alertes de stock, activité récente. |
| **Vente rapide** | Recherche instantanée, conditionnements, prix négociable, remise, encaissement avec monnaie à rendre. |
| **Facture / reçu** | Document numéroté imprimable ou enregistrable en PDF, partageable par WhatsApp. |
| **Produits & stock** | Fiches, conditionnements, seuils d'alerte, ajustement d'inventaire, journal des mouvements. |
| **Vente hors stock** | Article récupéré chez un confrère pour un client, avec marge et suivi en cinq étapes. |
| **Achats fournisseurs** | Commandes, réception partielle, coût moyen pondéré, documents joints. |
| **Historique** | Flux unifié — ventes, hors stock, commandes, réceptions — filtrable par période et par nature. |
| **Répertoires** | Clients (optionnels sur une vente) et fournisseurs. |

Volontairement hors périmètre : IA, marketplace, e-commerce, comptabilité OHADA,
paie, CRM, fidélité, prévisions, multi-boutiques.

## Trois décisions structurantes

**Un seul stock, compté en unité de base.** Un carton n'est pas un second stock :
c'est un facteur de conversion et un prix. Vendre 1 carton de 40 retire 40 pièces
du stock unique, ce qui gère naturellement les cartons entamés et évite d'avoir à
réconcilier un « stock gros » avec un « stock détail » qui finiraient par se
contredire.

**Commander n'est pas posséder.** Une commande de 50 sacs n'écrit aucun mouvement
de stock. Le stock n'augmente qu'à la réception, à hauteur de ce qui a réellement
été livré — la livraison partielle est donc native, pas rajoutée après coup.

**Rien ne s'efface.** Une vente annulée est marquée annulée et le stock est
restitué par un mouvement inverse ; un produit déjà vendu est archivé, jamais
supprimé. Le journal des mouvements permet de répondre à « pourquoi le stock
est-il passé de 50 à 37 ? ».

## Architecture

```
Next.js 15 (App Router)
   ↓  src/app/api/*      routes minces : garde d'authentification, validation, réponse
   ↓  src/server/*       logique métier et accès aux données, toujours filtrés par businessId
   ↓  src/domain/*       calculs purs, partagés avec le client (unités, totaux, marges, workflows)
   ↓  Neon Serverless Postgres
```

Le pilote HTTP de Neon exécute une transaction comme un tableau de requêtes non
chaînables. Les identifiants sont donc générés côté application, ce qui permet
d'écrire une vente, ses lignes, son encaissement et ses mouvements de stock dans
une seule transaction atomique.

`src/domain` ne dépend ni de React ni de la base : les mêmes fonctions calculent
le total affiché dans le panier et le total écrit en base. L'affichage est
instantané, mais le montant qui fait foi est celui que le serveur recalcule avant
d'écrire — le frontend n'est jamais la source de vérité financière.

## Sécurité

- Mots de passe hachés avec bcrypt.
- Access token JWT de 15 minutes portant `sub`, `businessId` et `role`, dans un
  cookie HttpOnly. Rien de sensible n'y figure : un JWT est lisible par quiconque
  le détient.
- Refresh token opaque de 30 jours, stocké **haché**, tourné à chaque usage et
  révoqué à la déconnexion.
- `JWT_SECRET` est obligatoire ; l'application échoue au démarrage plutôt que de
  signer avec une valeur par défaut.
- Toute requête métier filtre sur `business_id` : c'est la frontière entre deux
  quincailleries.
- Toutes les valeurs interpolées en SQL sont des paramètres liés.
- Deux contraintes de base portent une règle métier : `stock_quantity >= 0`
  (impossible de survendre) et `quantity_received <= quantity_ordered`.

## Démarrage

```bash
npm install
cp .env.example .env.local
```

Créez un projet sur [neon.tech](https://neon.tech/), copiez sa chaîne de
connexion dans `DATABASE_URL`, générez un secret :

```bash
openssl rand -base64 48   # à coller dans JWT_SECRET
```

Exécutez `schema.sql` dans l'éditeur SQL de Neon, puis :

```bash
npm run dev     # http://localhost:3000
```

Créez votre compte depuis l'écran d'inscription : il crée d'un même geste
l'utilisateur, sa quincaillerie et le lien `OWNER` entre les deux.

Autres commandes :

```bash
npm run lint    # ESLint
npm test        # tests unitaires du domaine (Vitest)
npm run build   # build de production
```

### Tests d'intégration

Les calculs purs de `src/domain` sont couverts par des tests unitaires. Ce qui ne
peut pas l'être — l'atomicité d'une vente, le rejet d'une survente par la
contrainte de stock, la restitution du stock à l'annulation, le coût moyen
pondéré après livraison partielle — est vérifié sur un vrai PostgreSQL :

```bash
TEST_DATABASE_URL=postgres://…/quincaflow_test npm test
```

Sans cette variable, cette partie de la suite est ignorée plutôt qu'en échec. Le
code testé est bien le code livré, jusqu'au texte SQL : `src/test/neonOverPg.js`
présente l'interface du pilote Neon au-dessus de `node-postgres`, plutôt que de
tordre le code de production pour le rendre testable.

### Intégration continue

`.github/workflows/ci.yml` rejoue tout cela sur chaque pull request et sur chaque
poussée vers `master`, en deux tâches parallèles : lint + format + build d'un
côté, tests de l'autre.

La tâche de tests démarre un service PostgreSQL 16, donc la suite d'intégration
s'exécute réellement en CI. Une étape de garde le vérifie : comme ces tests
s'ignorent d'eux-mêmes quand la base manque, une erreur de configuration du
service rendrait sinon la CI verte sans avoir contrôlé ni l'atomicité des ventes,
ni les contraintes de stock, ni l'isolation multi-tenant.

Le build tourne sans `DATABASE_URL` ni `JWT_SECRET` : aucun secret ne doit lui
être nécessaire. Le jour où il en réclame un, c'est qu'une lecture de base a
glissé dans le rendu statique.

## Modèle de données

19 tables. Toutes portent `business_id`, à deux exceptions près : `users` et
`refresh_tokens`.

```
businesses
 ├── business_members ─── users
 ├── products ─── product_units
 │        └── stock_movements        journal signé, en unité de base
 ├── customers, suppliers
 ├── sales ─── sale_items, payments
 ├── out_of_stock_sales               n'écrit aucun mouvement de stock
 ├── purchase_orders ─── purchase_order_items
 │        └── purchase_receipts ─── purchase_receipt_items
 ├── documents                        pièces jointes d'une commande
 └── counters                         numérotation par boutique
```

Références : `VE-0001` (vente), `FA-2026-0001` (facture, remise à zéro chaque
année), `HS-0001` (hors stock), `PO-0001` (commande), `RC-0001` (réception).

## Connectivité

QuincaFlow ne promet pas de fonctionner hors ligne. Un vrai mode hors ligne
transactionnel suppose de résoudre les ventes simultanées et les conflits de
stock — bien plus qu'un cache PWA. La V1 optimise pour les connexions faibles :
le catalogue est chargé une fois et filtré en mémoire, les écrans ne rechargent
que ce qui change.
