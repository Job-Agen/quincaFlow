# PRD — QuincaFlow

**Product Requirements Document**

- **Produit :** QuincaFlow
- **Version :** MVP 1.0
- **Type :** SaaS de gestion de quincaillerie
- **Stack imposée :** Next.js + Neon PostgreSQL + JWT
- **Approche :** Mobile-first, responsive
- **Marché initial :** petites et moyennes quincailleries
- **Devise initiale :** FCFA
- **Langue initiale :** Français

> Ce document est la source de vérité du produit. Les commentaires du code y
> renvoient par numéro de section (« §12 », « §29 »). Il avait été fourni en
> conversation et n'existait dans aucun fichier : il est versionné ici pour ne
> plus se perdre.

---

## 1. Vision

QuincaFlow est le cahier numérique d'une quincaillerie.

Le produit doit remplacer progressivement le fonctionnement dispersé entre cahier
papier, calculatrice, WhatsApp et documents, sans transformer le travail quotidien
du commerçant en utilisation d'un ERP complexe.

La règle fondamentale de QuincaFlow :

> Une information saisie une fois doit automatiquement mettre à jour tout ce qui
> en dépend.

Exemple :

```
5 vitres × 450 FCFA = 2 250 FCFA
```

Après validation :

```
Vente créée → Stock -5 → CA +2 250 → Marge calculée → Historique mis à jour → Dashboard mis à jour
```

---

## 2. Problème à résoudre

Les workflows observés dans les quincailleries étudiées sont fortement manuels.

**Vente**

```
Client → produits → papier → calculatrice → total → paiement → facture si nécessaire
```

**Approvisionnement**

```
Besoin → commande papier → photo WhatsApp → fournisseur → facture → banque → preuve de paiement → WhatsApp → livraison
```

**Produit indisponible**

Une quincaillerie peut également vendre un produit qu'elle n'a actuellement pas
en stock :

```
Demande client → recherche chez un autre vendeur → récupération du produit → paiement client → paiement de l'autre vendeur → marge
```

Un logiciel qui considère simplement `stock = 0 → vente impossible` ne correspond
donc pas entièrement à ce fonctionnement.

---

## 3. Objectif du MVP

Le MVP doit permettre au gérant d'effectuer les opérations essentielles
suivantes :

1. Vendre rapidement
2. Connaître son stock
3. Gérer ses produits
4. Gérer ses approvisionnements fournisseurs
5. Effectuer une vente hors stock
6. Générer une facture/reçu
7. Consulter son activité et son historique

QuincaFlow doit être suffisamment simple pour qu'une personne habituée à un
cahier et une calculatrice comprenne rapidement son fonctionnement.

---

## 4. Non-objectifs du MVP

Le MVP ne contiendra pas :

- ❌ IA
- ❌ marketplace
- ❌ boutique e-commerce
- ❌ comptabilité OHADA complète
- ❌ paie/RH
- ❌ CRM avancé
- ❌ fidélité
- ❌ application dédiée aux fournisseurs
- ❌ prévisions IA
- ❌ API WhatsApp Business complexe
- ❌ multi-boutiques avancé
- ❌ gestion comptable bancaire complète
- ❌ dizaines de rapports analytiques

Il faut résister à l'ajout prématuré de fonctionnalités.

---

## 5. Utilisateurs

**Propriétaire / gérant**

Utilisateur principal. Il peut accéder au dashboard, ventes, produits, stock,
achats, fournisseurs, clients, historique et paramètres.

**Vendeur**

Il doit principalement pouvoir :

- créer une vente ;
- rechercher les produits ;
- consulter les prix ;
- générer un reçu ;
- consulter les ventes nécessaires à son travail.

**MVP permissions**

Le système peut initialement utiliser deux rôles :

```
OWNER
SELLER
```

Pas de système RBAC complexe en V1.

---

## 6. Navigation

Navigation principale :

```
Accueil | Vendre | Produits | Achats | Historique | Plus
```

Dans Plus :

```
Clients | Fournisseurs | Paramètres | Déconnexion
```

Sur mobile, les fonctions les plus utilisées doivent rester immédiatement
accessibles.

---

## 7. F01 — Authentification

**Objectif** — sécuriser l'accès à chaque quincaillerie.

**Inscription.** Champs :

- nom du propriétaire ;
- nom de la quincaillerie ;
- téléphone ;
- email ;
- mot de passe.

**Connexion** — email/téléphone + mot de passe.

**JWT.** L'authentification utilisera des JSON Web Tokens.

Architecture recommandée : Access Token court + Refresh Token.

Le mot de passe doit être hashé côté serveur.

Le JWT doit contenir uniquement les informations nécessaires, par exemple :

```
userId
businessId
role
```

Ne jamais mettre le mot de passe ou des données sensibles dans le JWT.

Chaque requête protégée doit vérifier :

```
JWT valide + utilisateur + businessId + autorisation
```

Le `businessId` est particulièrement important pour empêcher une boutique
d'accéder aux données d'une autre.

---

## 8. F02 — Dashboard

**Objectif** — répondre rapidement :

> « Que s'est-il passé dans ma boutique aujourd'hui ? »

Afficher :

| Indicateur              | Exemple         |
| ----------------------- | --------------- |
| Ventes du jour          | 385 500 FCFA    |
| Marge brute estimée     | 82 300 FCFA     |
| Nombre de ventes        | 15              |
| Ventes hors stock       | 3               |
| Produits en stock faible | 4              |

**Activité récente**

```
10:47  Vente #V-1050        18 000 FCFA
10:03  Hors stock #HS-205   95 000 FCFA
09:15  Vente #V-1049        45 000 FCFA
```

**Stock faible** — afficher les produits ayant `stock <= seuilAlerte`.

Le dashboard doit rester simple. Pas de graphiques complexes dans le MVP.

---

## 9. F03 — Produits

Chaque produit possède :

```
id
businessId
name
sku
description
baseUnit
purchasePrice
sellingPrice
stockQuantity
lowStockThreshold
createdAt
updatedAt
```

Exemple :

```
Nom : Vitre 60 cm
Référence : VIT-060
Unité : pièce
Prix achat : 318,75 FCFA
Prix vente : 450 FCFA
Stock : 35
Seuil : 10
```

Actions : Créer | Modifier | Rechercher | Consulter

Pour éviter de casser l'historique comptable, la suppression physique d'un
produit déjà utilisé dans des transactions devrait être évitée. On privilégiera
son archivage/désactivation.

---

## 10. F04 — Unités et conditionnements

C'est une règle métier importante.

Un produit peut être acheté ou vendu sous différentes formes : pièce, carton,
boîte, sac, rouleau, mètre.

Exemple réel :

> 1 carton de vitres = 40 pièces

La base de stock doit utiliser une unité de référence. Ainsi `Stock = 80 pièces`
équivaut à `2 cartons`.

Si le vendeur vend `5 pièces`, le stock devient `75 pièces`. S'il vend ensuite
`1 carton`, le système retire `40 pièces` ; stock restant : `35 pièces`.

Cette architecture évite d'avoir deux stocks contradictoires « carton » et
« pièce ».

---

## 11. F05 — Vente rapide

C'est la fonctionnalité prioritaire de QuincaFlow. L'écran doit être extrêmement
rapide.

```
NOUVELLE VENTE

Client : Comptoir

Rechercher produit...

Produit       Qté      P.U.        Total

Serrure        3       5 000       15 000
Vitre          5         450        2 250
Vis           20         100        2 000

TOTAL                         19 250 FCFA

[ VALIDER LA VENTE ]
```

Le vendeur peut :

- rechercher un produit ;
- ajouter une ligne ;
- modifier quantité ;
- choisir le conditionnement ;
- modifier le prix si autorisé ;
- supprimer une ligne ;
- ajouter éventuellement un client.

---

## 12. Validation d'une vente

Lorsque le vendeur clique sur « Valider la vente », le backend doit effectuer une
**transaction atomique**.

Conceptuellement :

```
BEGIN
Create Sale
Create SaleItems
Create Payment
Create StockMovements
Update Stock
Calculate totals
COMMIT
```

Si une opération critique échoue : `ROLLBACK`.

On évite ainsi une situation où la vente existe mais où le stock n'a pas été mis
à jour.

---

## 13. Calculs

Pour chaque ligne :

```
lineTotal = quantity × unitPrice
```

Vente :

```
subtotal = somme(lineTotal)
```

Marge brute estimée :

```
grossMargin = sellingAmount - costOfGoodsSold
```

**Important :** marge brute ≠ bénéfice net. Transport, salaires, loyer, pertes et
autres dépenses ne sont pas encore déduits.

---

## 14. F06 — Paiement

Pour le MVP, prévoir :

```
CASH
MOBILE_MONEY
BANK
OTHER
```

Une vente contient :

```
paymentMethod
amountPaid
paymentStatus
```

Statuts :

```
PAID
PARTIAL
UNPAID
```

Cependant, la gestion complète du crédit client ne doit pas devenir un
mini-système bancaire dans la première version.

---

## 15. F07 — Facture / reçu

Après une vente : vente validée → générer facture/reçu.

Informations :

- QuincaFlow / identité boutique ;
- numéro ;
- date ;
- client ;
- articles ;
- quantités ;
- prix unitaires ;
- total ;
- mode de paiement.

Actions : PDF | Imprimer | Partager

Exemple :

```
QUINCAILLERIE ABC

FACTURE #FA-2026-00124

Serrure       3 × 5 000       15 000
Vitre         5 × 450          2 250
Vis          20 × 100          2 000

TOTAL                        19 250 FCFA
```

---

## 16. F08 — Vente hors stock

C'est une fonctionnalité différenciante importante.

Lorsqu'un produit est indisponible (`Stock = 0`), QuincaFlow peut proposer
« Vendre hors stock ».

Exemple :

```
Produit        Disqueuse 900W
Autre vendeur  Quincaillerie B
Coût           80 000 FCFA
Prix client    95 000 FCFA
```

Calcul :

```
95 000 - 80 000 = 15 000 FCFA
```

Afficher : `Marge brute : 15 000 FCFA`

---

## 17. Workflow hors stock

Statuts :

```
TO_SOURCE
SOURCED
CUSTOMER_PAID
SELLER_PAID
COMPLETED
CANCELLED
```

Workflow :

```
À récupérer → Récupéré → Client payé → Autre vendeur payé → Terminé
```

**Important :** le produit récupéré uniquement pour satisfaire cette commande
n'augmente pas automatiquement le stock normal.

---

## 18. F09 — Fournisseurs

Un fournisseur possède :

```
id
businessId
name
phone
whatsapp
address
notes
```

Actions : Créer | Modifier | Consulter | Voir commandes

---

## 19. F10 — Commandes fournisseurs

Le gérant peut créer :

```
Commande #PO-0042

Fournisseur : Société ABC

Ciment          50 sacs
Vitre            10 cartons
Peinture         20 seaux
```

Actions : Enregistrer | Générer document | Partager

Le document pourra être partagé via le mécanisme de partage du téléphone/WhatsApp.
Pas besoin d'intégration WhatsApp Business complexe en V1.

---

## 20. Workflow fournisseur

Statuts :

```
DRAFT
SENT
INVOICE_RECEIVED
PAID
PARTIALLY_RECEIVED
RECEIVED
CANCELLED
```

Flux :

```
Commande → Envoi → Facture → Paiement → Livraison → Réception
```

Documents associés : bon de commande ; facture fournisseur ; preuve de paiement.

---

## 21. Réception fournisseur

Règle essentielle :

> Commander un produit ne signifie pas le posséder.

Donc `50 sacs commandés` ne produit aucun mouvement de stock.

Après réception effective de `50 sacs`, QuincaFlow crée :

```
StockMovement
type = PURCHASE_RECEIPT
quantity = +50
```

et le stock augmente.

---

## 22. Livraison partielle

Le modèle doit supporter ce cas dès la conception.

```
Commandé : 50 sacs
Reçu : 30 sacs
```

Stock `+30`, commande `PARTIALLY_RECEIVED`.

Plus tard, `20 reçus` : stock `+20`, commande `RECEIVED`.

Cela évite de devoir reconstruire le modèle de données plus tard.

---

## 23. F11 — Clients

Le client est optionnel pour une vente comptoir.

Données :

```
id
businessId
name
phone
address
notes
```

Une vente rapide peut simplement utiliser « Client comptoir ». Cela évite
d'obliger le vendeur à créer une fiche pour chaque personne achetant quelques vis.

---

## 24. F12 — Historique

L'historique regroupe : ventes ; ventes hors stock ; achats ; réceptions ;
paiements.

Filtres simples :

```
Aujourd'hui | 7 jours | 30 jours | période
```

Recherche par : référence | client | produit

---

## 25. Gestion des annulations

Une vente validée ne doit pas simplement être supprimée.

Exemple : vente de `-5 serrures`. Si annulée, QuincaFlow crée un mouvement
inverse `+5 serrures` et marque `Sale.status = CANCELLED`.

Cela conserve une trace de ce qui s'est réellement passé.

---

## 26. Mouvements de stock

Le stock ne doit pas être géré uniquement par `product.stockQuantity = X`. Il
faut conserver un journal des mouvements.

Types :

```
SALE
SALE_CANCEL
PURCHASE_RECEIPT
RETURN
ADJUSTMENT
```

Chaque mouvement enregistre notamment :

```
productId
quantity
type
referenceId
userId
createdAt
```

Ainsi QuincaFlow peut expliquer :

> Pourquoi le stock est-il passé de 50 à 37 ?

---

## 27. Architecture technique

**Frontend + Backend : Next.js**

Architecture recommandée :

```
Next.js App Router
TypeScript
React
Tailwind CSS
shadcn/ui
```

> TypeScript, Tailwind et shadcn/ui sont des **recommandations d'implémentation**,
> pas des contraintes imposées.

Next.js gère : interface ; Server Components lorsque pertinent ; Route
Handlers/API ; validation ; logique serveur.

**Base de données : Neon PostgreSQL**

Organisation logique :

```
Next.js
↓
API / Server
↓
Business Logic
↓
Data Access
↓
Neon PostgreSQL
```

**Auth**

```
User
↓
Login
↓
Server verifies credentials
↓
JWT
↓
Protected requests
↓
Authorization
```

---

## 28. Modèle de données V1

Tables principales :

```
users
businesses
business_members
products
product_units
customers
suppliers

sales
sale_items
payments

out_of_stock_sales

purchase_orders
purchase_order_items
purchase_receipts
purchase_receipt_items

stock_movements

documents
```

Relations principales :

```
Business
├── Users
├── Products
├── Customers
├── Suppliers
├── Sales
└── PurchaseOrders

Sale
├── SaleItems
└── Payments

Product
└── StockMovements

PurchaseOrder
├── PurchaseOrderItems
└── PurchaseReceipts
```

---

## 29. Multi-tenant

QuincaFlow étant un SaaS, cette décision doit être prise dès le début.

Presque toutes les données métier doivent appartenir à `businessId` :

```
Product.businessId
Sale.businessId
Customer.businessId
Supplier.businessId
PurchaseOrder.businessId
```

Une requête ne doit jamais faire simplement :

```sql
SELECT * FROM products WHERE id = productId
```

Elle doit conceptuellement vérifier :

```sql
WHERE id = productId AND businessId = authenticatedBusinessId
```

C'est une règle de sécurité fondamentale.

---

## 30. Routes applicatives

Structure possible :

```
/login
/register

/dashboard

/sales
/sales/new
/sales/[id]

/out-of-stock
/out-of-stock/new
/out-of-stock/[id]

/products
/products/new
/products/[id]

/purchases
/purchases/new
/purchases/[id]

/customers
/suppliers

/history

/settings
```

---

## 31. API V1

Exemples :

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/dashboard

GET    /api/products
POST   /api/products
GET    /api/products/:id
PATCH  /api/products/:id

GET    /api/sales
POST   /api/sales
GET    /api/sales/:id
POST   /api/sales/:id/cancel

POST   /api/out-of-stock-sales
PATCH  /api/out-of-stock-sales/:id

GET    /api/purchase-orders
POST   /api/purchase-orders
GET    /api/purchase-orders/:id
POST   /api/purchase-orders/:id/receive

GET    /api/suppliers
POST   /api/suppliers

GET    /api/customers
POST   /api/customers
```

Les noms exacts pourront changer pendant l'architecture technique.

---

## 32. Responsive

Priorité : smartphone → tablette → desktop.

La vente doit être utilisable d'une seule main autant que raisonnablement
possible.

Cibles UX : gros boutons ; champs courts ; recherche rapide ; minimum de saisie ;
FCFA affiché clairement ; actions principales visibles ; aucun menu complexe
nécessaire pour vendre.

L'application doit par ailleurs s'installer sur le téléphone du gérant (§38).

---

## 33. Connectivité

Ne pas faire la promesse « QuincaFlow fonctionne entièrement hors ligne » dans le
premier MVP sans architecture de synchronisation sérieusement conçue.

C'est beaucoup plus complexe qu'un simple cache PWA : ventes simultanées, conflits
de stock et synchronisation peuvent provoquer des incohérences.

**Pour V1 :** optimiser pour connexions mobiles faibles et réduire les requêtes
inutiles.

Le vrai offline transactionnel pourra être étudié après validation terrain.

À ne pas confondre avec l'installation sur mobile (§38) : QuincaFlow s'installe
sur l'écran d'accueil sans pour autant fonctionner hors ligne.

---

## 34. Sécurité

Minimum obligatoire :

- mots de passe hashés ;
- JWT signés et expirables ;
- refresh tokens protégés ;
- cookies HttpOnly si utilisés pour les tokens ;
- validation serveur ;
- contrôle `businessId` ;
- autorisations par rôle ;
- protection des endpoints ;
- aucune confiance dans les valeurs venant du frontend ;
- requêtes PostgreSQL paramétrées/ORM ;
- journalisation des opérations critiques ;
- secrets uniquement côté serveur.

---

## 35. Performance

**Objectif UX :** les actions courantes doivent sembler immédiates.

Particulièrement : recherche produit ; ajout produit à une vente ; calcul du
total ; validation de vente.

Le calcul visuel du panier peut être effectué immédiatement côté client, mais le
serveur doit recalculer et valider les montants définitifs avant d'enregistrer la
transaction.

**Le frontend ne constitue jamais la source de vérité financière.**

---

## 36. Critères de réussite du MVP

Le MVP n'est pas validé parce qu'il est beau ou techniquement terminé. Il faut
observer des commerçants réels.

Nous devons notamment mesurer :

- **Adoption** — le commerçant utilise-t-il QuincaFlow au lieu de revenir
  immédiatement au cahier ?
- **Rapidité** — une vente courante peut-elle être enregistrée sans ralentir le
  vendeur ?
- **Fiabilité** — le stock affiché correspond-il suffisamment au stock réel ?
- **Compréhension** — le commerçant peut-il utiliser les fonctions principales
  avec très peu d'explications ?
- **Valeur** — le commerçant est-il prêt à payer pour continuer à l'utiliser ?

Ce dernier indicateur est essentiel.

---

## 37. Périmètre final du MVP

Le MVP QuincaFlow est donc :

> Un SaaS mobile-first de gestion pour quincailleries permettant de gérer produits
> et conditionnements, ventes rapides, factures/reçus, stock et mouvements, ventes
> hors stock, commandes et réceptions fournisseurs, clients, fournisseurs,
> historique et dashboard — installable sur Android et iOS depuis un lien (§38).

Architecture :

```
Next.js + TypeScript + Neon PostgreSQL + JWT
```

avec QuincaFlow conçu dès le départ comme SaaS multi-tenant.

---

## 38. Installation sur mobile

**Objectif**

Le gérant doit pouvoir installer QuincaFlow sur son téléphone, Android ou iOS, et
le lancer depuis son écran d'accueil comme n'importe quelle autre application :
une icône, un nom, un démarrage en plein écran.

**Pourquoi**

Une adresse web à retaper chaque matin n'est pas un outil de comptoir. Le
commerçant qui ouvre son cahier ne cherche pas une barre d'adresse. L'installation
n'ajoute aucune fonctionnalité : elle rend l'application atteignable en un geste,
ce qui conditionne l'adoption mesurée au §36.

**Forme retenue : application web installable (PWA)**

Pas d'application native, pas de passage par le Play Store ni par l'App Store en
V1. Les raisons tiennent au §4 — résister à l'ajout prématuré — et au terrain :

- une mise à jour est publiée en une fois, sans attendre la validation d'un
  store ni espérer que le commerçant mette à jour ;
- aucun compte développeur à ouvrir ni à renouveler (25 $ une fois chez Google,
  99 $ par an chez Apple) ;
- l'installation se fait depuis un lien, celui-là même qu'on envoie par WhatsApp.

**Ce que cela suppose concrètement**

| Exigence | Détail |
| --- | --- |
| Manifeste web | Nom, nom court, description, langue `fr`, `start_url`, `scope`, affichage `standalone`, orientation portrait, couleur de thème |
| Icônes | 192 et 512 px, plus une version `maskable` qui tient dans le cercle intérieur — sans quoi Android rogne les angles |
| Service worker | Obligatoire pour qu'Android propose l'installation ; un manifeste seul n'y suffit pas |
| Métadonnées iOS | Les balises `apple-mobile-web-app-*` ; iOS ignore le manifeste, et sans elles « Ajouter à l'écran d'accueil » n'ouvre qu'un onglet Safari déguisé |
| HTTPS | Requis pour l'installation comme pour la caméra |
| Zones sûres | `viewport-fit=cover` et `env(safe-area-inset-*)`, pour que la barre du bas ne passe pas sous l'encoche |

**Ce que le service worker ne doit pas faire**

Il met en cache la coque de l'application et les fichiers statiques. **Jamais
`/api`.** Un stock servi depuis le disque du téléphone, c'est une vente encaissée
sur un article déjà parti. En cas de coupure, l'écran affiche une erreur : le
gérant sait alors qu'il ne sait pas, ce qui vaut mieux qu'un chiffre périmé
présenté comme certain. Cette règle prolonge le §33 — installable n'est pas hors
ligne.

**Critères d'acceptation**

1. Sur Android (Chrome), le navigateur propose « Installer l'application », et
   l'application lancée depuis l'écran d'accueil n'affiche aucune barre d'adresse.
2. Sur iOS (Safari), « Ajouter à l'écran d'accueil » produit une icône au bon
   format et un lancement en plein écran.
3. L'icône installée est celle de la boutique, pas une capture de la page.
4. Hors réseau, l'application s'ouvre et annonce l'absence de connexion ; elle
   n'affiche aucun montant ni aucun stock issu du cache.
5. Une nouvelle version publiée est prise en compte au prochain lancement, sans
   geste du commerçant.

**Hors périmètre de cette exigence**

Notifications push, lecture de fichiers hors de l'application, synchronisation en
arrière-plan, publication sur les stores. Un emballage natif (Capacitor ou
équivalent) reste possible plus tard : la PWA en est la base, pas un détour.
