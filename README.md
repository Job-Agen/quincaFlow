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

SaaS multi-tenant, mobile d'abord, en français, en FCFA. Le cahier des charges
complet est versionné dans [`docs/prd.md`](docs/prd.md) ; les commentaires du code
y renvoient par numéro de section.

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
| **Rapports financiers** (§39) | Marge brute et bénéfice net d'une période, ventes par jour ou par mois, rentabilité produit par produit. |
| **Trésorerie** (§40) | Journal de caisse — encaissements et dépenses dans un même flux, avec solde courant —, six postes de dépense, photo du reçu, répartition en anneau. |

Volontairement hors périmètre : IA, marketplace, e-commerce, comptabilité OHADA,
paie, CRM, fidélité, prévisions, multi-boutiques.

**Rapports ≠ comptabilité.** Le bénéfice net du §39 déduit les dépenses saisies,
pas davantage : ni amortissement, ni TVA, ni bilan. Deux règles le rendent juste
plutôt que flatteur — l'achat de stock sort de la caisse sans être déduit du
bénéfice, la marchandise étant déjà comptée à son coût le jour de la vente ; et
un bénéfice net calculé sans aucune dépense saisie est annoncé pour ce qu'il
est, une marge brute.

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
Next.js 15 (App Router) + TypeScript strict
   ↓  src/app/api/*      routes minces : garde d'authentification, validation, réponse
   ↓  src/server/*       logique métier et accès aux données, toujours filtrés par businessId
   ↓  src/domain/*       calculs purs, partagés avec le client (unités, totaux, marges, workflows)
   ↓  src/types/*        vocabulaire commun : lignes de base en snake_case, objets métier en camelCase
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
- Les essais de connexion sont freinés (table `login_attempts`, fenêtre de
  15 minutes). Le comptage vit en base et non en mémoire : sur un hébergement
  sans état, chaque instance garderait le sien. La portée associe l'identifiant
  à l'adresse d'origine, afin qu'un tiers ne puisse pas verrouiller un compte à
  distance ; une seconde portée, par adresse seule, arrête le balayage de
  comptes depuis une même machine.
- Changer son mot de passe exige l'ancien et révoque toutes les sessions.
- En-têtes posés sur chaque réponse : `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy` et `Permissions-Policy`.
  HSTS est laissé à l'hébergeur, qui sait s'il sert déjà en HTTPS.

### Ce qui manque encore avant une ouverture publique

- **Réinitialisation de mot de passe oublié.** Elle suppose un service d'envoi
  d'e-mails, qui n'est pas encore choisi. En l'état, un mot de passe perdu se
  répare à la main en base.
- **Pages légales** (conditions d'utilisation, confidentialité).

## Mise en service

Deux gestes restent à faire à la main, dans la console de l'hébergeur. Ils ne
peuvent pas vivre dans ce dépôt : l'un porte un mot de passe, l'autre ouvre le
site au public.

### 1. La base

La base Neon du projet porte encore le schéma de l'application précédente : dix
tables en `id, user_id, data jsonb, updated_at`. Cinq d'entre elles s'appellent
comme les nouvelles — `users`, `products`, `sales`, `expenses`,
`stock_movements` — sans rien avoir en commun avec elles.

**Rejouer `schema.sql` par-dessus ne suffit donc pas** : `CREATE TABLE IF NOT
EXISTS` saute ces cinq tables, et l'application échouerait à l'exécution sur des
colonnes absentes, au lieu de refuser de démarrer. Il faut une base neuve.

1. Console Neon → projet `quincaFlow` → **Databases** → créer une base
   `quincaflow` (l'ancienne reste intacte, consultable).
2. **SQL Editor**, base `quincaflow` : coller le contenu de `schema.sql` et
   exécuter. 21 tables sont créées.
3. **Connection string** de cette base → la coller dans Vercel → Settings →
   Environment Variables → `DATABASE_URL`, pour *Production* **et** *Preview*
   (elle manque aujourd'hui en Preview).
4. Vérifier que `JWT_SECRET` est défini dans les mêmes environnements.
   L'application refuse de démarrer sans lui, plutôt que de signer les sessions
   avec une valeur connue.
5. Redéployer.

### 2. L'accès au site

Le site répond aujourd'hui par une redirection vers la page de connexion Vercel :
la protection des déploiements est active, et aucun commerçant ne peut ouvrir
l'application — ni depuis le lien, ni depuis l'APK.

Vercel → projet `quincaflow` → Settings → **Deployment Protection** → *Vercel
Authentication* → **Disabled**, puis enregistrer.

Une fois ces deux points faits, `https://quincaflow.vercel.app/api/health` doit
répondre `{"status":"ok"}` sans redirection.

## Rôles

Deux rôles (§5), et la frontière passe par l'argent et les prix.

| | Propriétaire | Vendeur |
| --- | --- | --- |
| Encaisser, vente hors stock, clients | ✔ | ✔ |
| Consulter catalogue, historique, tableau de bord | ✔ | ✔ |
| Créer un produit, changer un prix, ajuster le stock | ✔ | |
| Commander, réceptionner, fournisseurs | ✔ | |
| Annuler une vente | ✔ | |
| Coordonnées de la boutique, équipe | ✔ | |

Le propriétaire crée les comptes vendeurs depuis **Plus → Équipe** et leur
remet un premier mot de passe de vive voix ; le vendeur le change ensuite
depuis Paramètres. Retirer un vendeur ferme son accès mais conserve ses
ventes : l'historique doit continuer de dire qui a encaissé.

Les écrans masquent au vendeur les commandes qu'il ne peut pas exécuter, mais
c'est `requireOwner`, côté serveur, qui décide — une interface n'est pas une
autorisation.

## Supervision

`GET /api/health` interroge réellement la base et répond `200 {"status":"ok"}`
ou `503 {"status":"degraded"}`. C'est l'adresse à surveiller : un service qui
répond alors que Neon est injoignable est en panne du point de vue du
commerçant.

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
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit, tests compris
npm test           # Vitest : métier (node) + interface (jsdom)
npm run build      # build de production
```

### Trois familles de tests

**Métier (node).** Les calculs purs de `src/domain` — unités et conditionnements,
totaux, marges, transitions de statut. Rapides, sans DOM ni base.

**Interface (jsdom).** Les écrans sont montés pour vérifier ce que le gérant voit
réellement. Deux comportements y sont gardés parce qu'ils ont déjà cassé ou
coûteraient cher :

- une coupure réseau ne doit pas renvoyer à l'écran de connexion (§38) — elle
  l'a fait, et le test échoue sur le code d'avant la correction ;
- le panier doit refuser la validation au-delà du stock, et dire combien il en
  reste.

Les deux environnements vivent côte à côte dans `vitest.config.ts` : jsdom n'est
payé que par les tests qui en ont besoin.

**Intégration (PostgreSQL réel).** Ce qui ne peut pas être simulé — l'atomicité d'une vente, le rejet d'une survente par la
contrainte de stock, la restitution du stock à l'annulation, le coût moyen
pondéré après livraison partielle — est vérifié sur un vrai PostgreSQL :

```bash
TEST_DATABASE_URL=postgres://…/quincaflow_test npm test
```

Sans cette variable, cette partie de la suite est ignorée plutôt qu'en échec. Le
code testé est bien le code livré, jusqu'au texte SQL : `src/test/neonOverPg.ts`
présente l'interface du pilote Neon au-dessus de `node-postgres`, plutôt que de
tordre le code de production pour le rendre testable.

Un test n'est retenu que s'il a d'abord échoué sur le code d'avant le correctif.
Un test écrit après coup et vert du premier coup ne prouve rien.

### Intégration continue

`.github/workflows/ci.yml` rejoue tout cela sur chaque pull request et sur chaque
poussée vers `master`, en deux tâches parallèles : lint + format + types + build
d'un côté, tests de l'autre.

La tâche de tests démarre un service PostgreSQL 16, donc la suite d'intégration
s'exécute réellement en CI. Une étape de garde le vérifie : comme ces tests
s'ignorent d'eux-mêmes quand la base manque, une erreur de configuration du
service rendrait sinon la CI verte sans avoir contrôlé ni l'atomicité des ventes,
ni les contraintes de stock, ni l'isolation multi-tenant.

Le build tourne sans `DATABASE_URL` ni `JWT_SECRET` : aucun secret ne doit lui
être nécessaire. Le jour où il en réclame un, c'est qu'une lecture de base a
glissé dans le rendu statique.

## Modèle de données

21 tables : les 18 du §28, plus `counters` (numérotation), `login_attempts`
(freinage des essais de mot de passe) et `expenses` (§40). Toutes portent
`business_id` à trois exceptions près : `users`, `refresh_tokens` et
`login_attempts`.

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
 ├── expenses                         sorties de caisse, datées du jour du décaissement
 ├── documents                        pièces jointes d'une commande, et reçus de dépense
 └── counters                         numérotation par boutique
```

Une dépense porte `spent_on`, une date civile distincte de `created_at` : le
gérant note au matin le taxi-bagages de la veille, et la dépense doit peser sur
le jour où l'argent est sorti. Son justificatif se range dans `documents`, avec
les pièces des commandes fournisseurs — `reference_type = 'EXPENSE'`.

Références : `VE-0001` (vente), `FA-2026-0001` (facture, remise à zéro chaque
année), `HS-0001` (hors stock), `PO-0001` (commande), `RC-0001` (réception).

## Navigation (§6)

```
Accueil | Vendre | Produits | Achats | Historique | Plus
```

L'accueil vit à `/dashboard` ; `/` y redirige, parce que c'est l'adresse qu'un
gérant tape ou met en favori. « Plus » regroupe Clients, Fournisseurs et
Paramètres, auxquels s'ajoutent quatre entrées que le PRD décrit sans les
rattacher à une navigation : Ventes hors stock (§16), Équipe — sans laquelle le
rôle SELLER du §5 ne pourrait être attribué à personne —, Rapports financiers
(§39) et Journal de caisse (§40). Ces deux dernières sont réservées au
propriétaire : elles donnent les salaires de toute l'équipe et le loyer de la
boutique.

## Application Android native (§41)

`mobile/` est une application React Native (Expo). Ce n'est pas la page web
empaquetée : ce sont des écrans natifs qui appellent les mêmes routes d'API.

```bash
cd mobile && npm install
npx expo start                      # développement, avec Expo Go
EXPO_PUBLIC_API_URL=https://… npx expo start

export ANDROID_HOME=/chemin/vers/android-sdk
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
# mobile/android/app/build/outputs/apk/release/app-release.apk
```

**`assembleRelease`, et non `assembleDebug`** : un paquet de mise au point ne
contient pas le JavaScript, il le réclame à un serveur Metro et ne sert donc à
rien hors du poste de développement.

`reactNativeArchitectures` écarte `x86` et `x86_64`, qui ne servent qu'aux
émulateurs : 48 Mo au lieu de 83, sur un marché où la donnée mobile se paie.
Les deux architectures conservées couvrent tous les téléphones réels, y compris
les 32 bits d'entrée de gamme.

**Le domaine est partagé, pas recopié.** `metro.config.js` et `tsconfig.json`
font pointer `@/…` vers le `src/` du dépôt : l'application mobile importe
`@/domain/sale`, `@/utils/format` et `@/types` — les fichiers mêmes du web. Une
correction de calcul vaut donc pour les deux, et les mêmes tests la couvrent.
C'est la raison pour laquelle React Native a été retenu plutôt que Flutter, qui
aurait imposé une seconde implémentation en Dart des formules monétaires. La CI
type-vérifie `mobile/` pour que ce partage ne se rompe pas en silence.

`mobile/android` et `mobile/ios` sont générés par `expo prebuild` et ne sont pas
versionnés : la configuration vit dans `app.json`.

La version de mise au point est signée par la clé de débogage d'Android : elle
s'installe en autorisant les « sources inconnues » et ne peut pas être publiée.
Une version de diffusion suppose une clé de signature détenue par le commerçant,
qui ne doit pas vivre dans ce dépôt.

**L'application ne fonctionne pas hors ligne**, et c'est délibéré : les totaux
sont calculés côté serveur (§35). Sans réseau, l'écran annonce la coupure plutôt
que d'afficher un chiffre périmé (§33).

## Connectivité (§33) et installation (§38)

QuincaFlow ne promet pas de fonctionner hors ligne. Le PRD écarte l'offline
transactionnel de la V1 : ventes simultanées et conflits de stock demandent une
architecture de synchronisation que le terrain n'a pas encore justifiée.

L'application est en revanche installable sur Android et iOS (manifeste, icônes,
service worker, métadonnées iOS), comme l'exige le §38 : le gérant l'ouvre depuis
son écran d'accueil, sans barre d'adresse. Ce service worker met en cache la coque et les fichiers
statiques — **jamais `/api`**. Un stock servi depuis le disque du téléphone, ce
serait une vente encaissée sur un article déjà parti : en cas de coupure, l'écran
affiche une erreur plutôt qu'un chiffre périmé.
