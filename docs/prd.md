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

Le bénéfice net, lui, exige que ces dépenses soient enregistrées quelque part :
c'est l'objet du §39, qui ajoute leur saisie et en déduit un résultat de période.

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

Les rapports financiers, la saisie des dépenses et le journal de caisse
s'ajoutent à cette liste (§39, §40) :

```
/reports
/expenses
/cash
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
> historique, dashboard, rapports financiers avec dépenses et marges (§39) et
> journal de caisse avec justificatifs (§40) — installable sur Android et iOS
> depuis un lien (§38), et disponible sur Android en application native (§41).

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
arrière-plan, publication sur les stores.

**Suite : une application Android native (§41)**

La PWA reste la forme décrite ci-dessus, et continue de valoir pour iOS. Android
reçoit en plus une **véritable application**, écrite en React Native : c'est
l'objet du §41. Ce n'est pas un emballage de la page web — c'est un second
client, avec ses propres écrans, qui appelle les mêmes routes d'API.

---

## 39. Rapports financiers & marges

**Objectif**

Répondre à la question que le tableau de bord ne pose pas : « qu'est-ce que ce
mois m'a réellement rapporté ? ». Le §8 regarde la journée en cours ; cette
section regarde une période, et va jusqu'au bénéfice, dépenses déduites.

Trois réponses attendues :

1. la marge brute **et le bénéfice net réel** de la période ;
2. le rapport des ventes par période ;
3. la rentabilité produit par produit.

**Pourquoi le bénéfice net exige une saisie des dépenses**

Le §13 le dit sans détour : marge brute ≠ bénéfice net, parce que transport,
salaires, loyer et pertes ne sont pas déduits. Tant que ces dépenses ne sont
enregistrées nulle part, aucun calcul ne peut produire un bénéfice net — il ne
serait qu'une marge brute rebaptisée, et le commerçant croirait gagner ce qu'il
a déjà dépensé.

Cette section ajoute donc une **saisie des dépenses**, sans laquelle l'exigence
« bénéfices réels nets » n'est pas tenable.

**F13 — Dépenses**

| Champ | Détail |
| --- | --- |
| Poste | Les six postes fixés au §40 |
| Libellé | Texte court : « Taxi-bagages livraison Kara », « Salaire Kossi juin » |
| Montant | FCFA, positif |
| Date de la dépense | La date où l'argent est sorti, pas celle de la saisie : le gérant note le transport de la veille le lendemain matin |
| Justificatif | Photo du reçu, facultative (§40) |
| Note | Facultative |

Une dépense se saisit, se corrige et se supprime. Elle n'entre dans aucun
mouvement de stock : ce n'est pas une marchandise.

**Calculs de la période**

```
chiffreAffairesVentes   = somme(ventes.total)              — ventes COMPLETED
chiffreAffairesHorsStock = somme(prixVente × quantité)     — hors stock non annulées
chiffreAffaires         = chiffreAffairesVentes + chiffreAffairesHorsStock

coutMarchandises        = somme(ventes.cost_of_goods)
                        + somme(horsStock: coût × quantité)

margeBrute              = chiffreAffaires − coutMarchandises
tauxDeMarge             = margeBrute / chiffreAffaires

depensesFonctionnement  = somme(dépenses de la période, hors « Achat de stock »)
beneficeNet             = margeBrute − depensesFonctionnement
```

**Pourquoi l'achat de stock n'est pas déduit du bénéfice.** La marchandise achetée
est déjà comptée, mais au moment où elle est vendue : c'est le coût des
marchandises vendues (§13, §28). La déduire une seconde fois en tant que dépense
ferait payer deux fois le même sac de ciment, et un mois de réassort afficherait
une perte imaginaire. L'achat de stock est une sortie de caisse (§40), pas une
charge de la période.

Une vente annulée (§25) ne compte dans aucun de ces totaux : elle reste dans
l'historique, mais un chiffre d'affaires qui l'inclurait ne se retrouverait pas
en caisse.

**Rapport des ventes par période**

Le total est découpé en tranches : par jour lorsque la période couvre trois mois
ou moins, par mois au-delà. Chaque tranche porte le nombre de ventes, le chiffre
d'affaires, le coût et la marge. La somme des tranches doit être exactement
égale au total affiché en tête : un rapport dont les lignes ne reconstituent pas
son propre total ne vaut rien.

**Rentabilité produit par produit**

Une ligne par produit vendu sur la période :

| Colonne | Détail |
| --- | --- |
| Quantité vendue | En unité de base (§10) : 80 pièces, non « 2 cartons » |
| Chiffre d'affaires | Somme des lignes de vente, **remise répartie** (voir ci-dessous) |
| Coût | Somme des `sale_items.unit_cost`, figés à la vente |
| Marge | Chiffre d'affaires − coût |
| Taux de marge | Marge / chiffre d'affaires |

Le coût vient de `sale_items.unit_cost`, figé à l'instant de la vente (§28) : le
prix d'achat qui bougera demain ne doit pas réécrire la marge d'hier.

**Répartition de la remise.** La remise est accordée sur la vente entière, pas
sur une ligne. L'attribuer à un seul produit fausserait sa rentabilité ; l'ignorer
ferait que la somme des produits dépasse le chiffre d'affaires réel. Elle est
donc répartie au prorata du montant de chaque ligne :

```
chiffreAffairesLigne = lineTotal × (vente.total / vente.subtotal)
```

**Ventes hors stock.** Elles portent une marge réelle (§16) et sont rattachées à
leur produit, mais comptées à part dans la ligne du produit : la quantité hors
stock n'est pas exprimée en unité de base, puisque l'article n'est jamais entré
en stock.

**Accès**

Réservé au propriétaire. Le §5 donne au vendeur ce qu'il faut pour vendre ;
salaires, loyer et bénéfice net ne s'y trouvent pas — et un vendeur qui lit la
fiche de paie de ses collègues est un problème que le produit doit éviter de
créer.

**Routes** — s'ajoutent au §30 :

```
/reports
/expenses
```

L'entrée vit dans « Plus » (§6), comme Clients et Fournisseurs : on ne consulte
pas un rapport financier pendant qu'un client attend au comptoir.

**Ce que cette section n'est pas**

Pas de comptabilité. Pas de bilan, pas de TVA, pas d'amortissement, pas de
compte de résultat au sens légal. Le §4 tient : ce qui est produit ici est un
état de gestion, lisible par un commerçant, pas une liasse fiscale.

Un seul graphique existe, celui de la répartition des dépenses (§40). Le §8
n'interdit les graphiques que sur le tableau de bord, et celui-là répond à une
question qu'une colonne de chiffres pose mal : « lequel de mes postes me mange ? ».

**Honnêteté de l'affichage**

L'écran doit dire ce que le chiffre vaut. « Bénéfice net » n'est juste que si
toutes les dépenses de la période ont été saisies ; l'écran le rappelle et
indique combien de dépenses composent le total. Un bénéfice net affiché sans
aucune dépense enregistrée est une marge brute, et l'écran doit le dire.

**Critères d'acceptation**

1. Le résultat de la période affiche chiffre d'affaires, coût des marchandises,
   marge brute, dépenses et bénéfice net, dans cet ordre, en FCFA.
2. La somme des tranches du rapport par période égale le chiffre d'affaires
   affiché en tête.
3. La somme des chiffres d'affaires par produit égale le chiffre d'affaires des
   ventes de la période, remises comprises.
4. Une vente annulée n'apparaît dans aucun total.
5. Une dépense saisie fait baisser le bénéfice net du même montant, et lui seul.
6. Un vendeur qui appelle la route des rapports reçoit un refus.
7. Le rapport d'une boutique ne contient aucune ligne d'une autre (§29).

---

## 40. Trésorerie & suivi des dépenses

**Objectif**

Savoir ce qui est entré et ce qui est sorti de la caisse, jour par jour. Le §39
répond à « combien ai-je gagné ? » ; celui-ci répond à « où est passé
l'argent ? ». Ce ne sont pas la même question, et la réponse peut différer du
tout au tout : un mois de gros réassort vide la caisse tout en étant rentable.

**F14 — Journal de caisse**

Un seul flux chronologique, entrées et sorties mêlées, avec un solde qui court.

| Sens | Origine |
| --- | --- |
| Entrée | Encaissement d'une vente : espèces, Mobile Money, virement ou autre — chaque paiement tel qu'il a été enregistré (§14) |
| Sortie | Dépense de fonctionnement du commerce (voir les postes ci-dessous) |

Chaque ligne porte sa date, son libellé, son moyen ou son poste, son montant et
le solde après l'opération. Le total des entrées, celui des sorties et le solde
de la période sont affichés en tête.

**Ce que le journal ne contient pas.** Les encaissements d'une vente annulée
(§25) : l'argent est revenu au client, et le compter en entrée gonflerait une
caisse que le gérant ne retrouverait pas. Les pertes et la casse non plus :
aucun argent ne sort du tiroir quand une vitre se brise — c'est un ajustement de
stock (§26), pas une dépense.

**Les ventes hors stock n'y figurent pas encore, et c'est une limite connue.**
Le §17 suit leur avancement par une étape (« client payé »), sans jamais
enregistrer de montant encaissé ni de date de règlement. Le journal ne peut donc
pas les porter sans inventer la somme et le jour. Elles comptent bien, en
revanche, dans le chiffre d'affaires et la marge du §39. Les faire entrer en
caisse suppose d'ajouter un montant et une date de paiement au workflow hors
stock : c'est une évolution du §17, pas de cette section.

**Le solde est celui des opérations saisies, pas le fond de caisse.** Aucun solde
d'ouverture n'est demandé en V1 : le journal dit combien la période a fait
entrer et sortir, non combien il reste dans le tiroir. L'écran le dit, plutôt que
de laisser croire à un solde de caisse réel.

**Postes de dépense**

Six postes, tirés de ce que paie réellement une quincaillerie :

| Code | Libellé | Exemple |
| --- | --- | --- |
| `RENT` | Loyer de boutique | Loyer du mois, avance de bail |
| `UTILITIES` | Énergie et eau | Facture CEET, facture TdE, groupe électrogène |
| `SALARY` | Salaires des commis | Paie du mois, avance sur salaire, journée d'apprenti |
| `STOCK_PURCHASE` | Achat de stock | Sacs de ciment payés comptant chez le grossiste |
| `TRANSPORT` | Transport | Tricycle de livraison, taxi-bagages, carburant |
| `OTHER` | Divers | Le reste, détaillé par le libellé |

`STOCK_PURCHASE` est une sortie de caisse mais **pas** une charge de la période :
voir l'explication du §39. Les cinq autres sont déduites du bénéfice net.

**F15 — Justificatif de dépense**

Une dépense peut porter la photo de son reçu, prise à l'appareil ou choisie dans
la galerie. C'est ce qui rend la dépense opposable : « 45 000 de transport » sans
pièce se discute, avec le reçu ne se discute plus.

| Exigence | Détail |
| --- | --- |
| Source | Appareil photo ou galerie — `capture` proposé, jamais imposé, le reçu étant souvent déjà dans le téléphone |
| Réduction | L'image est réduite côté téléphone avant l'envoi : un cliché de 4 Mo sur une connexion de comptoir ne part pas |
| Format | JPEG, un seul justificatif par dépense, remplaçable et supprimable |
| Chargement | La liste des dépenses ne transporte jamais les images : elle indique seulement qu'un reçu existe, et l'image n'est demandée qu'à l'ouverture de la dépense |

Le justificatif se range parmi les pièces jointes (§20), avec les bons de commande
et les factures fournisseurs : même table, même notion.

**F16 — Répartition des dépenses**

Un graphique en anneau, une part par poste, accompagné de sa légende chiffrée. Il
répond à une question qu'une colonne de chiffres pose mal : lequel de mes postes
me mange ?

| Exigence | Détail |
| --- | --- |
| Lisibilité | Les parts sont aussi listées en clair, avec montant et pourcentage : le graphique éclaire, il ne remplace pas les chiffres |
| Accessibilité | Le graphique est décrit en texte pour un lecteur d'écran, et ne porte aucune information que la légende ne porte aussi |
| Couleur | La couleur ne distingue pas seule : chaque part est nommée dans la légende, dans le même ordre |
| Sobriété | Pas d'animation, pas de bibliothèque de graphiques — un SVG, calculé à l'affichage |

**Routes** — s'ajoutent au §30 :

```
/cash
```

**Accès**

Propriétaire seul, pour les mêmes raisons qu'au §39 : le journal de caisse donne
les salaires de toute l'équipe et le loyer de la boutique.

**Critères d'acceptation**

1. Le journal affiche entrées et sorties dans un même flux, du plus récent au
   plus ancien, chacune avec son solde courant.
2. Total des entrées − total des sorties = solde de la période, à la ligne près.
3. L'encaissement d'une vente annulée n'apparaît pas dans le journal.
4. Une dépense « Achat de stock » apparaît en sortie de caisse et ne réduit pas
   le bénéfice net du §39.
5. Une photo de reçu se joint depuis l'appareil ou la galerie, se remplace et se
   supprime ; la liste des dépenses reste légère.
6. Le graphique de répartition n'affiche aucun poste que la légende n'affiche
   aussi, avec son montant.
7. Le journal d'une boutique ne contient aucune ligne d'une autre (§29).

---

## 41. Application Android native

**Objectif**

Livrer sur Android une application installée, écrite en React Native, plutôt
qu'une page web déguisée. Le §38 garde sa valeur — la PWA reste la forme
d'installation universelle, et la seule pour iOS en V1 — mais Android reçoit un
vrai client natif.

**Pourquoi React Native plutôt que Flutter**

La question s'est posée entre les deux. Le partage du domaine a tranché.

`src/domain` contient l'arithmétique qui décide de l'argent du commerçant : la
vente du §11, les conditionnements du §10, la répartition de la remise et le
bénéfice net du §39. Ce sont 679 lignes de TypeScript pur, couvertes par les
tests du web.

- En React Native, ces fichiers sont **importés tels quels**. Une correction de
  calcul vaut pour le web et pour le mobile, et les mêmes tests la couvrent.
- En Flutter, ils auraient été réécrits en Dart. Deux implémentations des mêmes
  formules, qu'il aurait fallu garder d'accord à la main — et c'est exactement
  là que naissent les écarts de montants entre l'écran et la facture.

Flutter aurait offert un rendu plus homogène sur les vieux Android. Pour une
application de formulaires et de listes, cet avantage ne pèse pas le risque
d'avoir deux vérités sur le prix d'un sac de ciment.

**Ce qui est partagé, ce qui ne l'est pas**

| Couche | Sort |
| --- | --- |
| Routes d'API, couche serveur, base | Inchangées. Le mobile est un client de plus |
| `src/domain`, `src/types`, `src/utils` | **Importés tels quels** par le mobile, via Metro et les chemins TypeScript |
| Écrans, navigation, styles | Réécrits en natif. React Native n'a ni `div` ni CSS en cascade |
| Client HTTP | Réécrit, et c'est la divergence assumée : le transport des jetons diffère (voir ci-dessous) |

**Transport de la session**

Le navigateur reçoit ses jetons en cookies `HttpOnly`, que le JavaScript de la
page ne peut pas lire — c'est ce qui met une session hors de portée d'un script
injecté. Une application native n'a pas de cookie exploitable.

Les routes d'authentification rendent donc les jetons dans le corps de la
réponse, **mais seulement sur demande explicite** : l'en-tête
`x-quinca-client: native`, que le web ne pose jamais. Le second transport
n'affaiblit pas le premier.

| Règle | Raison |
| --- | --- |
| Les jetons ne figurent dans aucune réponse au navigateur | Sinon les cookies `HttpOnly` ne protègent plus rien |
| Le cookie prime sur le corps partout où les deux se présentent | Sinon un corps forgé substituerait une session à celle du gérant |
| Le refresh token va dans le coffre du système (Keystore) | Il vaut trente jours de session, et un téléphone de comptoir passe de main en main |
| L'access token ne vit qu'en mémoire | Quinze minutes : l'écrire sur le disque l'exposerait sans rien faire gagner |
| `getSession()` accepte `Authorization: Bearer` | Sans quoi aucune requête native ne serait authentifiée |

**Périmètre**

L'application couvre les vingt-cinq écrans du web, livrés en deux temps : le
parcours de comptoir d'abord — connexion, accueil, vente rapide, produits —
puis le reste, une fois cette base éprouvée. Livrer les vingt-cinq écrans avant
le premier essai aurait été construire vingt fois sur un modèle peut-être à
revoir.

La navigation est celle du §6, à six onglets ; les écrans de détail s'empilent
par-dessus et rendent le bouton de retour d'Android.

**Permissions**

L'application ne demande qu'Internet et la caméra — cette dernière pour
photographier un reçu (§40). Les greffons Expo déclarent les permissions de
toutes leurs capacités et non de celles qu'on emploie : `expo-image-picker` sait
filmer, donc réclame le micro ; `expo-secure-store` sait s'adosser à l'empreinte,
donc réclame le capteur. Elles sont retirées par un greffon de configuration.

Ce n'est pas de la cosmétique. Un commerçant à qui Android annonce
« MaQuincaillerie veut enregistrer l'audio » a raison de refuser d'installer, et
il aurait tort de s'habituer à accepter.

**Ce que l'application native n'apporte pas**

Elle ne fonctionne pas hors ligne. Les totaux sont calculés côté serveur (§35),
le stock vit en base, et le §33 vaut ici comme ailleurs : sans réseau, l'écran
annonce la coupure plutôt que d'afficher un chiffre périmé. Une application
installée n'est pas une application autonome, et le laisser croire ferait
encaisser des ventes sur un stock imaginaire.

**Critères d'acceptation**

1. L'APK s'installe sur Android 6 ou plus récent et s'ouvre sur l'écran de
   connexion.
2. Une session ouverte survit à la fermeture de l'application : le refresh token
   du coffre la rouvre au lancement suivant.
3. Le total affiché par le panier est celui que le serveur enregistre, au franc
   près — ce sont les mêmes fonctions.
4. Un panier au-delà du stock est refusé avant l'encaissement, avec le nombre
   réellement disponible (§12).
5. Hors réseau, l'application annonce la coupure et n'affiche aucun montant.
6. Une réponse d'authentification au navigateur ne contient aucun jeton.

---

## 42. Cahier de recettes

**Objectif**

Rendre au gérant le cahier qu'il tient à la main : ce qui est entré aujourd'hui,
hier, avant-hier. Le §39 regarde la rentabilité d'une période, le §40 le
mouvement de la caisse ; celui-ci répond à la question du soir, la seule que le
commerçant se pose en fermant : « combien ai-je fait aujourd'hui ? »

Il comble aussi un trou. L'argent qui entre sans passer par une vente de produit
— une réparation, une livraison facturée, la location d'une brouette, une
vieille dette remboursée — n'a aujourd'hui nulle part où aller. Il ne figure ni
dans le chiffre d'affaires, ni dans le journal de caisse. Le cahier de papier le
portait ; l'application le perdait.

**F17 — Les recettes, jour par jour**

Un écran, deux moitiés qui se complètent.

La première se remplit toute seule : chaque encaissement de vente (§14) tombe
dans la journée où il a eu lieu. La seconde se saisit à la main : les
encaissements hors vente.

Chaque journée affiche son total, et la part de chaque origine. La période se
choisit comme ailleurs — ce mois, le mois dernier, trente jours, tout.

**F18 — Encaissements hors vente**

Un montant, un libellé, une date, un poste, une note facultative. Cinq postes :

| Poste | Exemple |
| --- | --- |
| Service rendu | Découpe de fer, réparation, pose |
| Livraison | Course facturée au client |
| Location de matériel | Brouette, bétonnière, échafaudage |
| Remboursement de dette | Un client solde une ardoise ancienne |
| Divers | Le reste |

Le propriétaire et le vendeur peuvent tous deux en saisir : l'argent entre au
comptoir, et interdire au vendeur de l'inscrire le ferait disparaître.

**Toute recette n'est pas un chiffre d'affaires.**

C'est la règle de cette section, et elle est la symétrique exacte de l'achat de
stock au §40.

Un remboursement de dette fait entrer de l'argent, mais la vente a été comptée
le jour où elle a eu lieu, au prix et au coût de ce jour-là (§13). La recompter
à l'encaissement gonflerait le chiffre d'affaires d'un mois avec les ventes d'un
autre, et le gérant croirait avoir vendu deux fois.

Elle entre donc dans le journal de caisse et dans le cahier, mais pas dans le
chiffre d'affaires du §39. Les quatre autres postes, eux, sont bien du chiffre
d'affaires — sans coût de marchandise, donc intégralement en marge.

**Ce que le cahier ne contient pas.** Les encaissements d'une vente annulée
(§25), pour la raison du §40 : l'argent est reparti. Et les ventes hors stock,
tant que le §17 n'enregistrera ni montant encaissé ni date de règlement — la
même limite, dite au même endroit.

**Conséquences sur les sections voisines**

- **§39** gagne une ligne : « Recettes hors vente », entre les ventes hors stock
  et le chiffre d'affaires. Sans coût, elle passe entière dans la marge brute.
- **§40** gagne une troisième origine d'entrée, à côté des encaissements de
  vente : les recettes hors vente, avec leur poste pour détail.

**Critères d'acceptation**

1. Un encaissement de vente apparaît dans la journée où il a eu lieu, sans
   aucune saisie.
2. Une recette hors vente se saisit, se corrige et se supprime ; elle apparaît
   le jour de sa date, non le jour de sa saisie.
3. Le total d'une journée est la somme de ses lignes, à l'unité près.
4. Un « Remboursement de dette » apparaît dans le cahier et en entrée de caisse,
   et n'augmente pas le chiffre d'affaires du §39.
5. Un « Service rendu » augmente le chiffre d'affaires **et** la marge brute du
   §39, sans toucher au coût des marchandises vendues.
6. L'encaissement d'une vente annulée n'apparaît pas dans le cahier.
7. Le cahier d'une boutique ne contient aucune ligne d'une autre (§29).
