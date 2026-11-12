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

---

## 43. Bon de commande fournisseur

**Objectif**

Le §19 annonçait trois actions sur une commande : « Enregistrer | Générer
document | Partager ». Deux ont été faites. La troisième — le document — n'a
jamais existé, et le partage s'est contenté d'un texte brut :

```
Commande PO-0042
Fournisseur : Ets Kodjo

• Ciment Diamond 50 kg — 40 sac
• Fer à béton 8 — 20 barre

Total estimé : 242 000 FCFA
```

Ce message a trois défauts, et chacun coûte quelque chose au gérant. Il ne dit
pas **qui commande** : le fournisseur reçoit une liste sans nom de boutique ni
numéro de téléphone, et ne sait ni à qui répondre ni où livrer. Il ne dit pas
**à quel prix** : les coûts unitaires sont saisis à la commande, stockés en
base, et jetés au moment de l'envoi — c'est-à-dire au seul moment où ils
engagent les deux parties. Et il ne ressemble pas à un bon de commande : à
Lomé, un gérant qui envoie ça traite avec un fournisseur qui, lui, répond sur
papier à en-tête.

**F19 — Le document**

Un bon de commande, mis en page comme la facture du §15 et imprimable par le
même chemin — « Imprimer » propose « Enregistrer au format PDF » sur tous les
navigateurs mobiles courants, ce qui donne la pièce jointe sans embarquer de
moteur PDF.

Il porte :

- l'identité de la boutique — nom, accroche, adresse, téléphone ;
- le titre « BON DE COMMANDE » et le numéro (PO-0042) ;
- la date, le fournisseur, le statut ;
- les lignes : désignation, quantité, prix unitaire, total de ligne ;
- le total estimé ;
- les observations, quand il y en a ;
- deux emplacements de signature, le gérant et le fournisseur.

Une commande annulée (§20) porte le filigrane du §15 : c'est le document seul
qui circule, et rien d'autre n'avertirait le fournisseur qu'il ne vaut plus
commande.

**F20 — Le message WhatsApp**

Le document se joint ; le message se lit dans la conversation. Les deux sont
construits à partir des mêmes données, et le message est rendu par une seule
fonction du domaine — pas trois fois, à trois endroits, avec trois résultats
différents comme c'était le cas.

```
*QUINCAILLERIE ABC*
Lomé — Avenue de la Libération
Tél : 90 11 22 33

*BON DE COMMANDE N° PO-0042*
Date : 10/10/2026
Fournisseur : Ets Kodjo

1. Ciment Diamond 50 kg
   40 sacs × 3 800 = 152 000 FCFA
2. Fer à béton 8
   20 barres × 4 500 = 90 000 FCFA

*TOTAL ESTIMÉ : 242 000 FCFA*

Merci de nous confirmer la disponibilité, le délai de livraison et le prix
définitif.

QUINCAILLERIE ABC — Tél : 90 11 22 33
```

Les astérisques sont la mise en gras de WhatsApp : le message arrive mis en
forme, pas décoré de symboles. On ne tente pas d'aligner des colonnes en
espaces — la police de WhatsApp est proportionnelle, et un tableau ASCII y
arrive de travers.

**Une commande sans prix est une demande de prix.** Le gérant qui ne connaît pas
encore le tarif laisse les coûts à zéro. Le document s'intitule alors « DEMANDE
DE PRIX » et non « BON DE COMMANDE » : les lignes portent la seule quantité, le
total disparaît — annoncer « 0 FCFA » serait faux — et la clôture demande un
prix au lieu de le confirmer. Garder le titre d'un bon de commande tout en
demandant les tarifs donnerait au fournisseur deux lectures contradictoires, et
il pourrait y voir un engagement sur des prix qu'il n'a pas encore donnés. C'est
le même écran pour les deux usages, parce que c'est la même démarche à deux
jours d'intervalle.

**Une commande annulée ne demande rien.** Sous un bandeau « ANNULÉE », une
clôture qui réclame un délai de livraison annule l'annulation dans la tête de
celui qui lit : le message demande alors de ne pas donner suite, et rien
d'autre.

**Routes**

```
/purchases/[id]/document
```

**Critères d'acceptation**

1. Le document porte le nom, l'adresse et le téléphone de la boutique, le
   numéro de commande et la date.
2. Chaque ligne montre la quantité, le prix unitaire et le total de ligne ; la
   somme des lignes est le total affiché.
3. « Imprimer » ne sort que le document : ni barre d'application, ni boutons.
4. Le message WhatsApp porte les mêmes montants que le document, au franc près.
5. Une commande sans aucun prix s'intitule « DEMANDE DE PRIX », n'affiche aucun
   total, et sa clôture demande le prix.
6. Une commande annulée demande de ne pas donner suite, et ne réclame ni délai
   ni confirmation.
7. Une commande annulée porte le filigrane sur le document et un avertissement
   en tête du message.
8. Le message est rendu par la même fonction sur le web et sur l'Android (§41).

## 44. Deux versions, une application

**Objectif**

L'application existe en deux formes depuis le §41 : le site, écrit pour un
téléphone tenu à une main, et l'Android natif, compilé depuis le même domaine
métier. Il manquait à chacune ce qui la rend réellement utilisable.

Au site, l'écran large. Les maquettes tiennent dans 760 pixels — c'est le
comptoir, et c'est bien. Mais le gérant qui fait ses comptes le soir ne les
fait pas sur son téléphone : il les fait sur l'ordinateur de l'arrière-boutique,
où ces 760 pixels laissaient les deux tiers de l'écran vides et une liste de
produits en colonne unique là où un tableau se lisait d'un coup d'œil.

À l'Android, un moyen de l'obtenir. Le fichier d'installation n'existait que
dans une conversation : chaque gérant, chaque vendeur, chaque téléphone de
rechange supposait qu'on lui envoie l'APK à la main. Une application qu'on ne
peut pas télécharger n'est pas distribuée, elle est prêtée.

**F20 — La version bureau**

À partir de 1 200 px, et à ces conditions seulement :

- la colonne de lecture passe à 1 040 px ;
- les lignes de liste se répartissent en colonnes — nom, référence, stock,
  prix — au lieu de s'empiler ;
- le tableau de bord aligne ses tuiles sur une seule ligne ;
- le bouton flottant revient contre la colonne.

Rien d'autre ne change : mêmes écrans, mêmes couleurs, même navigation. Un
gérant qui passe du téléphone à l'ordinateur ne réapprend rien. Le menu latéral
du §6, lui, apparaît dès 900 px et ne change pas.

L'installation sur ordinateur passe par le manifeste du §38 : Chrome et Edge
posent l'application dans le menu Démarrer, avec sa fenêtre et son icône. La
page de téléchargement propose l'installation quand le navigateur l'autorise,
et explique le geste manuel sinon.

**F21 — La page de téléchargement**

`/telecharger`, servie sans session — on ne demande pas de se connecter pour
obtenir l'application qui sert à se connecter.

Elle porte le fichier, les quatre gestes de l'installation hors Play Store
(autoriser la source, passer l'avertissement Play Protect), ce que la mise à
jour ne détruit pas, et l'empreinte SHA-256 du fichier pour qui l'aurait reçu
par WhatsApp plutôt que depuis le site.

L'APK est compilé pour les deux familles de processeurs ARM, 32 et 64 bits : la
version 64 bits seule pèse six mébioctets de moins et refuse de s'installer sur
les téléphones d'entrée de gamme encore très répandus.

**Critères d'acceptation**

1. `/telecharger` s'affiche sans session, et ne renvoie pas vers la connexion.
2. Un gérant connecté qui l'ouvre depuis « Plus » y trouve un retour vers son
   tableau de bord.
3. La version, la taille, l'empreinte et l'Android minimal annoncés sont ceux
   du fichier servi — ils sont relevés sur l'APK, jamais saisis.
4. Le fichier s'installe sur un téléphone 32 bits comme sur un 64 bits.
5. Chaque publication porte un `versionCode` supérieur au précédent, faute de
   quoi Android refuse la mise à jour.
6. Le téléchargement n'est ni intercepté ni mis en cache par le service worker.
7. À 1 200 px, la liste des produits se lit en colonnes ; à 390 px, elle reste
   celle du §6, inchangée.

## 45. Carnet de crédit

**Objectif**

Le §14 posait une limite : « la gestion complète du crédit client ne doit pas
devenir un mini-système bancaire dans la première version ». Elle a été tenue —
trop bien. L'application savait enregistrer une vente à moitié payée, et plus
rien ensuite. La dette restait ouverte pour toujours : aucun écran ne la
montrait, aucun geste ne la soldait, et le gérant continuait de tenir son vrai
carnet sur un cahier à côté du téléphone.

Or à Lomé, la dette n'est pas une option du logiciel, c'est le quotidien. Le
maçon prend ses sacs le lundi et paie le vendredi, quand son propre client l'a
payé. Un logiciel de quincaillerie qui ne sait pas tenir l'ardoise ne remplace
pas le cahier : il s'y ajoute.

**Le choix de fond**

Une dette n'est pas une écriture à part : c'est une vente dont le montant
encaissé est inférieur au total. Rien n'est créé en parallèle, et c'est ce qui
garantit trois choses.

- La dette ne peut pas diverger de la vente qui l'a produite, puisqu'elle s'en
  déduit.
- Un remboursement est un encaissement comme un autre : il entre dans la même
  table que le paiement du comptoir, donc dans le journal de caisse (§40) le
  jour où l'argent est entré.
- Le chiffre d'affaires (§39) ne bouge pas quand une vieille ardoise est
  soldée : il compte les ventes, pas les encaissements. Le compter là serait le
  compter deux fois.

**F22 — La fiche client**

Nom, téléphone, total acheté, solde dû. Puis, dans cet ordre : les achats non
soldés avec leur reste à payer, les versements reçus, et le reste des achats.

C'est l'ordre des questions qu'on se pose quand le client entre : combien
me doit-il, depuis quand, qu'a-t-il acheté ? Le solde est donc en tête, et non
calculé de tête en faisant défiler des ventes.

Le total acheté ne compte que les ventes du §12. Les ventes hors stock (§16) en
sont absentes à dessein : elles n'enregistrent aucun encaissement et peuvent
n'avoir jamais été livrées.

**F23 — Le remboursement**

Le gérant saisit une somme, jamais une répartition : au comptoir, le client pose
un billet sur le carnet, il ne désigne pas une facture. Le versement s'impute
donc à la plus ancienne ardoise d'abord, puis déborde sur la suivante — la règle
du cahier, celle que le gérant applique de tête.

Partiel ou total, avec un motif libre — « vente de sa récolte », « avance sur
chantier » — qui est ce qui rend un carnet relisible trois mois plus tard. Un
raccourci « tout solder » remplit le montant exact, parce que c'est le cas le
plus fréquent et que retaper 47 500 de tête est le meilleur moyen de taper
4 750.

Un versement supérieur à la dette est refusé plutôt que transformé en avoir :
l'avance client est un autre sujet, que cette section ne traite pas.

**F24 — Le classement des débiteurs**

En tête du répertoire client, les cinq plus grosses ardoises en barres
proportionnelles, de la plus longue à la plus courte, avec le nom, le montant et
l'ancienneté. Une seule teinte : il n'y a qu'une grandeur mesurée. La barre ne
porte aucune information seule — nom et montant sont écrits sur chaque ligne.

La carte disparaît quand personne ne doit rien.

**F25 — La relance WhatsApp**

Un bouton, sur la fiche du client, qui ouvre WhatsApp sur un brouillon :
salutation, nom de la boutique, nombre d'achats non soldés, montant dû, et une
porte ouverte — « un règlement en plusieurs fois est possible ».

Pas de menace, pas de date butoir, pas de majuscules : le débiteur est un client
qu'on veut garder, souvent un voisin. Le message est un brouillon modifiable,
jamais un envoi : qui veut être sec l'écrira lui-même.

Le numéro est normalisé pour WhatsApp — « 90 00 00 00 », « +228 90-00-00-00 » et
« 00228 90000000 » mènent à la même conversation. Un numéro trop court ne
déclenche rien : ouvrir une conversation avec un inconnu est pire que ne rien
proposer.

**Critères d'acceptation**

1. La fiche d'un client montre son total acheté et son solde dû, et le
   répertoire porte l'ardoise de chacun.
2. Un remboursement solde la plus ancienne vente impayée d'abord, puis déborde
   sur la suivante ; la somme imputée vaut exactement la somme versée.
3. Un versement supérieur à la dette est refusé, et n'écrit rien.
4. Un remboursement apparaît dans le journal de caisse le jour où l'argent est
   entré, sous le nom « Remboursement », jamais « Vente ».
5. Le chiffre d'affaires du §39 ne change pas quand une dette est soldée.
6. Une vente annulée (§25) ne laisse aucune dette derrière elle.
7. Le classement ne montre que des clients qui doivent, et la plus longue barre
   occupe la pleine largeur.
8. La relance ouvre WhatsApp sur un brouillon portant le montant dû ; sans
   numéro utilisable, le bouton n'apparaît pas.
9. Tout cela existe sur le web et sur l'Android (§41), depuis les mêmes règles.

## 46. Fermer sa boutique

**Objectif**

L'application savait tout créer et rien effacer. Une quincaillerie ouverte par
erreur, une boutique d'essai, un commerce qui ferme : dans les trois cas la
donnée restait, et le seul moyen de s'en défaire était d'écrire du SQL dans la
console de l'hébergeur — c'est-à-dire, pour un gérant, aucun moyen.

C'est aussi une question de respect : des ventes, des clients et des dettes
appartiennent à celui qui les a saisis. S'il veut les retirer, il doit pouvoir
le faire lui-même, sans demander la permission à personne.

**F26 — Trois verrous, et pas un de plus**

Chacun arrête une erreur différente, et c'est pourquoi aucun ne suffit seul.

- **Le rôle.** Seul le propriétaire peut fermer la boutique (§5). Un vendeur
  qui tape le bon mot de passe n'y arrive pas davantage : la route exige le
  rôle avant de lire quoi que ce soit.
- **Le mot de passe.** Il arrête le téléphone resté déverrouillé sur le
  comptoir pendant que le gérant sert un client.
- **Le nom de la boutique, retapé.** Il arrête le propriétaire lui-même —
  celui qui a le mot de passe et qui appuie trop vite. Une case à cocher se
  coche du pouce ; un nom se tape.

La comparaison du nom ignore la casse, les accents et les espaces en trop.
« Quincaillerie Le Bâtisseur » demande un accent circonflexe que le clavier
d'un téléphone d'entrée de gamme ne donne pas sans peine, et punir
l'orthographe n'ajoute aucune sécurité : il faut toujours avoir tapé le nom
entier.

**F27 — Dire le poids avant d'effacer**

Avant de demander quoi que ce soit, l'écran compte et montre : tant de ventes,
tant de produits, tant de clients, tant de fournisseurs, tant de comptes. « 184
ventes » ne se lit pas comme « 2 ventes », et c'est précisément ce que le
gérant doit peser.

Rien n'est archivé ni désactivé : la boutique part, et ses dépendances avec
elle par les clés étrangères. Un « archivage » laisserait croire à un retour en
arrière qui n'existe pas, et on ne fait pas croire cela à quelqu'un qui efface
ses ventes.

**F28 — Les comptes, eux, ne partent pas tous**

Un utilisateur n'appartient pas à une boutique. Ne sont supprimés que ceux qui
n'en tiennent plus aucune — le propriétaire et ses vendeurs, dans le cas
ordinaire. Celui qui gère une seconde quincaillerie garde son compte et y
reste connecté.

Côté client, la session est fermée dans la foulée : le jeton désigne un compte
qui vient peut-être de disparaître, et le laisser dans le navigateur ne mènerait
qu'à des refus incompréhensibles.

**Critères d'acceptation**

1. Un vendeur ne voit pas la zone de danger, et la route lui refuse la
   suppression.
2. L'écran annonce le nombre de ventes, produits, clients, fournisseurs et
   comptes avant toute saisie.
3. Un mot de passe faux refuse la suppression, et n'efface rien.
4. Un nom mal retapé refuse la suppression, et n'efface rien.
5. Le nom se confirme à la casse et aux accents près, mais pas en abrégé.
6. La suppression efface la boutique, ses produits, ses ventes, ses lignes de
   vente, ses encaissements, ses clients et ses mouvements de stock.
7. Les comptes qui ne tenaient que cette boutique sont supprimés ; celui qui en
   tient une autre est conservé.
8. La boutique voisine n'est pas touchée (§29).
9. La session est fermée et l'écran revient à la connexion.

## 47. Page d'accueil publique

**Objectif**

La racine du site renvoyait au tableau de bord, donc — pour qui n'a pas de
compte — à l'écran de connexion. Quelqu'un à qui on dicte l'adresse de
l'application tombait sur un formulaire, sans savoir ce qu'elle fait ni comment
l'installer. C'était le seul chemin d'entrée, et il ne menait nulle part.

Le §44 avait donné une page de téléchargement, mais il faut en connaître
l'adresse. Il manquait la porte.

**F29 — Ce qu'elle dit, et dans quel ordre**

Trois choses, et rien d'autre.

1. **Ce que l'application fait** : vendre au comptoir, compter en sacs et en
   cartons, tenir l'ardoise, commander chez le fournisseur, savoir ce qui
   reste, vendre ce qu'on n'a pas. Six capacités, décrites par ce qu'elles
   changent pour le gérant, pas par leur nom technique.
2. **Où la télécharger** : le bouton porte la taille réelle du fichier et la
   version, relevées sur l'APK (§44). Jamais un chiffre écrit à la main.
3. **Comment l'essayer sans rien installer** : le navigateur suffit, et c'est
   le même compte.

Pas de témoignages, pas de chiffres d'adoption, pas de prix barrés. Un gérant
qui envisage d'y mettre sa caisse a besoin de savoir ce qu'elle sait faire.

**F30 — Deux captures, et elles sont vraies**

Une du téléphone, une de l'ordinateur, prises dans l'application en
fonctionnement avec des chiffres du jour — pas des maquettes, pas un tableau de
bord à zéro. Ce sont les mêmes images que l'installation sur ordinateur (§44)
présente au navigateur : elles ne coûtent rien de plus.

**Critères d'acceptation**

1. La racine s'affiche sans session, et ne renvoie pas vers la connexion.
2. Un gérant déjà connecté qui ouvre la racine arrive sur son tableau de bord.
3. Le bouton de téléchargement sert l'APK publié, avec sa taille et sa version
   réelles.
4. La page tient à 390 px comme à 1 440 px, sans défilement horizontal.
5. Aucune capture ne montre l'indicateur de développement ni un écran vide.

## 48. Exports comptables et sauvegarde

**Objectif**

Le gérant n'est pas le seul à regarder ses chiffres : il y a le comptable en
fin d'exercice, l'associé, parfois la banque. Aucun d'eux n'ouvrira
l'application — ils veulent un fichier. Jusqu'ici il n'en existait aucun, et
des années de ventes étaient prisonnières de l'écran.

**F31 — Trois fichiers, trois questions**

Ce que je détiens, ce que j'ai vendu, ce qu'on me doit. Un seul fichier qui les
mélangerait obligerait à les démêler dans le tableur.

- **Inventaire** — référence, produit, prix d'achat et de vente, marge unitaire
  et taux, stock, seuil, état (Rupture / Stock bas / OK), valeur au coût et à
  la vente, conditionnements.
- **Ventes** — une ligne par article vendu, avec le coût et la marge de la
  ligne, puis l'en-tête de la vente répété : total, encaissé, reste dû, mode de
  règlement, statut, et si la vente a été annulée. Une ligne par vente perdrait
  le détail des articles ; une ligne par article est la forme qu'un tableur
  sait regrouper.
- **Clients et dettes** — total acheté, solde dû, nombre d'achats non soldés,
  date de la plus ancienne dette.

Un bouton « Tout télécharger » les enchaîne.

**F32 — Lisibles par Excel sans manipulation**

Trois décisions, chacune contre un échec courant :

- **point-virgule** comme séparateur, parce qu'un Excel français lit la virgule
  comme séparateur décimal et ouvrirait tout en une colonne ;
- **virgule décimale** dans les nombres, sans séparateur de milliers, pour que
  les colonnes s'additionnent ;
- **BOM UTF-8** en tête, sans quoi « Bâtisseur » devient « BÃ¢tisseur ».

**F33 — La sauvegarde**

Tout ce que la boutique contient, dans un seul fichier JSON : produits,
conditionnements, clients, fournisseurs, ventes et leurs lignes, encaissements,
commandes, réceptions, mouvements de stock, dépenses, recettes, membres.

Ce n'est pas un export comptable mais un filet : ce qu'on garde avant de fermer
une boutique (§46), et ce qu'on emporte si l'on quitte un jour ce logiciel. Les
mots de passe en sont absents — une sauvegarde se range dans un dossier
« Téléchargements », pas dans un coffre.

**Critères d'acceptation**

1. Les quatre fichiers se téléchargent depuis les Paramètres, propriétaire
   seulement : ils portent les prix d'achat et les marges que le §5 cache au
   vendeur.
2. Chaque CSV commence par le BOM, sépare par `;` et écrit les décimales à la
   virgule.
3. Une valeur contenant `;`, `"` ou un retour à la ligne est protégée par des
   guillemets.
4. L'inventaire chiffre la valeur du stock au coût et à la vente.
5. L'export des ventes porte une ligne par article, avec le reste dû de la
   vente.
6. Aucun fichier ne laisse passer une ligne d'une autre quincaillerie (§29).
7. La sauvegarde ne contient aucun mot de passe.

## 49. Ce que le tableau de bord ne disait pas

**Objectif**

Le §8 donne cinq chiffres du jour et s'arrête là, par refus du tableau de bord
qui noie le gérant sous les courbes. Le refus reste juste, mais il laissait
trois questions sans réponse — et ce sont celles qu'on se pose en ouvrant
l'application le matin :

- **« Est-ce que ça monte ou ça descend ? »** Un chiffre du jour seul ne le dit
  pas. 45 000 FCFA, c'est bien ou mal ? La réponse est dans les six jours
  précédents.
- **« Qu'est-ce qui fait vivre la boutique ? »** Le gérant croit souvent le
  savoir ; les chiffres le démentent souvent.
- **« Combien d'argent dort dehors ? »** Le carnet de crédit (§45) existe, mais
  il faut aller le chercher. Une dette qu'on ne voit pas est une dette qu'on
  oublie de réclamer.

**F34 — La semaine en barres**

Sept barres, une par jour, la dernière étant aujourd'hui. Pas de bibliothèque
de graphiques : des div en CSS, une seule teinte, et le texte porte toute
l'information — seul le meilleur jour est chiffré sous sa barre, et la
description complète est lue à voix haute par un lecteur d'écran.

Les sept jours sont toujours là, y compris ceux sans vente. Un jour absent de
la série serait lu comme une baisse alors qu'il n'y a qu'une absence de donnée.

**F35 — Les cinq plus vendus de la semaine**

Classés par chiffre d'affaires, avec la quantité en unités de base : un carton
compte pour ses quarante pièces, sinon la ligne qui rapporte le plus
s'afficherait « 1 vendu ».

La fenêtre est la semaine, pas toute l'histoire : ce qui se vendait l'an
dernier n'aide pas à décider du réassort de demain.

**F36 — Les créances, en sixième tuile**

Le total dû par les clients et le nombre de clients concernés, qui mène d'un
appui au carnet de crédit. C'est le rappel que le §45 ne pouvait pas faire
depuis sa propre page.

**F37 — La valeur du stock**

En tête de la liste des produits : ce que le stock a coûté, et ce qu'il
rapporterait vendu. L'écart entre les deux est la marge qui dort dans le
magasin. Le propriétaire seul y a accès — le prix d'achat est ce que le §5
cache au vendeur.

Les produits archivés et ceux à zéro n'y figurent pas : ni les uns ni les
autres ne valent quelque chose en rayon.

**Critères d'acceptation**

1. La semaine rend toujours sept jours, les jours sans vente à zéro, le dernier
   étant aujourd'hui.
2. Une vente annulée ne compte ni dans la semaine, ni dans le palmarès, ni dans
   les créances.
3. Le palmarès compte les quantités en unités de base et se limite aux sept
   derniers jours.
4. Le nombre de débiteurs compte les clients, pas les ardoises : trois ventes
   non soldées du même client font un débiteur.
5. Un client qui a tout payé ne figure pas dans les créances.
6. Aucun de ces chiffres ne traverse la frontière d'une boutique (§29).
7. La valeur du stock ignore les produits archivés et les produits à zéro, et
   n'est lisible que par le propriétaire.

## 50. Carte bancaire et opérateur Mobile Money

**Objectif**

« Mobile Money » ne se rapproche de rien. Le soir, le gérant ouvre son relevé
Flooz, puis son relevé T-Money : deux portefeuilles, deux soldes. Un total qui
les mélange ne tombe juste ni sur l'un ni sur l'autre, et il faut reprendre la
journée vente par vente pour savoir laquelle était sur quel compte.

La carte bancaire manquait aussi. Rare au comptoir d'une quincaillerie de
quartier, elle ne l'est pas pour un chantier réglé par une entreprise, et la
ranger dans « Autre » efface l'information au lieu de l'enregistrer.

**F38 — L'opérateur derrière le Mobile Money**

Six choix : T-Money, Flooz, Orange Money, MTN MoMo, Wave, Autre. Les deux
premiers sont ceux du Togo ; les suivants permettent à la même application de
servir un commerçant d'un pays voisin sans modification.

Le choix n'apparaît que lorsqu'il sert. Demander « Flooz ou T-Money ? » à chaque
vente en espèces ajouterait un geste à l'opération la plus fréquente du
comptoir. Et l'opérateur n'est retenu que derrière un paiement Mobile Money :
accroché à des espèces, il ferait lire un virement qui n'a pas eu lieu.

Il suit l'argent partout où il va : la vente, son encaissement, un
remboursement de dette rapporté des semaines plus tard (§45), le journal de
caisse (§40) et l'export des ventes (§48).

**F39 — Les lignes déjà saisies restent lisibles**

Une vente enregistrée avant cette version ne porte pas d'opérateur, et
continue de se lire « Mobile Money ». Il lui manque seulement de quoi se
rapprocher d'un relevé — rien n'est faux, rien n'est à corriger.

**Critères d'acceptation**

1. Les cinq moyens de paiement sont proposés : espèces, Mobile Money, carte
   bancaire, virement, autre.
2. Le choix de l'opérateur n'apparaît qu'après avoir choisi Mobile Money.
3. Un opérateur envoyé avec un autre moyen de paiement est ignoré, pas
   enregistré.
4. Un opérateur inconnu est refusé par le serveur.
5. L'opérateur suit la vente, son encaissement et un remboursement de dette.
6. Le journal de caisse distingue « Mobile Money · Flooz » de
   « Mobile Money · T-Money ».
7. Une ligne sans opérateur se lit « Mobile Money », sans mention vide.

## 51. Logo et numéro fiscal sur les pièces

**Objectif**

La facture et le bon de commande sont les deux seules pièces qui sortent de la
boutique. Elles portaient son nom, son adresse et son téléphone — et il leur
manquait les deux choses qui font qu'un document est pris au sérieux.

Le **numéro fiscal** d'abord (IFU au Togo et au Bénin, NIF ailleurs). Une
facture sans lui n'est pas une facture pour une entreprise cliente : elle ne
peut pas la passer en charge, et elle la renvoie. Le commerçant refait le
document à la main, ou perd le client.

Le **logo** ensuite. Dans une liasse de vingt factures, celle qui porte
l'enseigne se retrouve ; les autres se ressemblent toutes.

**F40 — Le numéro fiscal**

Un champ de plus dans les Paramètres, imprimé sous le téléphone. Vide, il ne
laisse rien — pas d'étiquette orpheline : un « IFU / NIF : » suivi de rien
serait pire que l'absence.

**F41 — Le logo**

Choisi depuis le téléphone, réduit à 320 px de côté avant l'envoi — la facture
l'affiche à deux centimètres, au-delà on transporte des pixels que personne ne
verra sur une connexion qui se paie au mégaoctet.

Il est réencodé en **PNG, transparence gardée** : un logo est presque toujours
posé sur un fond transparent, et le passer en JPEG sur fond blanc lui collerait
un rectangle visible dès que la facture s'imprime sur autre chose que du blanc
pur. C'est la différence avec le justificatif de dépense (§40), qui lui est
réduit en JPEG sur fond blanc parce qu'un reçu manuscrit n'a pas de
transparence à préserver.

Il vit en `data:` URL dans la base, comme ces justificatifs, et pour la même
raison : aucun stockage d'objets n'est configuré. Le choix est borné — une
image par boutique, 400 Ko au plus, et c'est le serveur qui le vérifie, pas
l'écran.

Le propriétaire seul y touche : l'en-tête d'une facture engage le commerce,
un vendeur n'a pas à le réécrire (§5).

**F42 — Un seul en-tête, deux documents**

La facture (§15) et le bon de commande (§43) disent la même chose de la
boutique. L'en-tête est désormais un seul composant : le dire à deux endroits
garantissait qu'un ajout n'arriverait que dans l'un des deux.

**Critères d'acceptation**

1. Le numéro fiscal et le logo se saisissent dans les Paramètres, propriétaire
   seulement.
2. Un champ vide n'imprime pas son étiquette.
3. Le logo apparaît en tête de la facture et du bon de commande ; sans logo, le
   pictogramme reste.
4. Le serveur refuse un logo qui n'est pas une image, et un logo trop lourd.
5. Une chaîne vide retire le logo.
6. Ni le logo ni le numéro fiscal ne franchissent la frontière d'une boutique
   (§29).

## 52. Les rayons du catalogue

**Objectif**

Une quincaillerie de quartier tient trois cents références. Au comptoir, le
vendeur les cherche par leur nom — et il faut déjà savoir ce qu'on cherche.
Quand le client dit « il me faut un coude, je ne sais pas lequel », la
recherche par nom ne sert à rien : ce qu'il faut, c'est voir tout le rayon
plomberie.

**F43 — Un rayon par produit, en texte libre**

Pas de liste fermée. Les rayons d'une quincaillerie de Lomé ne sont pas ceux
d'une autre — l'une sépare la plomberie de l'assainissement, l'autre vend
surtout du ciment et de la tôle. Une taxonomie imposée serait contournée dès le
dixième produit, par un « Divers » fourre-tout.

Le champ se complète par ce qui existe déjà : au dixième produit, « Plomberie »
s'offre tout seul. C'est ce qui garde une orthographe unique sans l'imposer.

Un rayon tapé en blancs est une absence de rayon — sinon le filtre proposerait
un rayon sans nom, impossible à désigner.

**F44 — Filtrer le catalogue**

Dans les Produits, une liste déroulante qui chiffre chaque rayon — « Plomberie
(12) » — et ne propose que les rayons qui contiennent quelque chose. Un rayon
dont le dernier article est archivé disparaît : le proposer ne mènerait qu'à
une liste vide.

**F45 — Filtrer au comptoir**

Les mêmes rayons en pastilles, au-dessus de la recherche de l'écran de vente.
Ils se déduisent du catalogue déjà chargé, sans appel réseau : au comptoir,
filtrer ne doit pas attendre. Les plus fournis d'abord, puisque c'est là qu'on
cherche le plus souvent. La rangée n'apparaît qu'à partir de deux rayons —
un seul ne se filtre pas.

**Critères d'acceptation**

1. Le rayon se saisit sur la fiche produit, et se complète par ceux qui
   existent.
2. Un produit sans rayon reste normal : il s'affiche partout, hors de tout
   filtre.
3. La liste des rayons ignore les produits archivés et se classe du plus fourni
   au moins fourni.
4. Le filtre de rayon se combine à la recherche et aux filtres de stock.
5. Les rayons d'une boutique ne sont jamais visibles d'une autre (§29).
6. Le rayon figure dans l'inventaire exporté (§48).

## 53. Ce que la boutique doit à ses fournisseurs

**Objectif**

Le §45 a donné au gérant le carnet de ses clients. Il lui manquait le même
carnet de l'autre côté du comptoir : il prend sa livraison de ciment le lundi,
règle la moitié tout de suite et le reste à la fin du mois — et l'application
n'en gardait aucune trace.

C'est pourtant l'argent qu'il doit mettre de côté avant de se croire riche
d'une bonne journée de ventes. Une caisse pleine le soir d'une grosse
livraison n'est pas un bénéfice : c'est une dette qui n'a pas encore été
appelée.

**F46 — On ne doit que ce qui est arrivé**

La règle qui fait toute la différence avec la dette client. Une commande passée
n'engage aucun paiement ; une commande livrée, si. La dette se calcule donc sur
la valeur de ce qui a été **reçu**, aux prix de la commande, et non sur le total
commandé.

Sans cette règle, des centaines de milliers de francs apparaîtraient dus pour
des sacs encore chez le fournisseur. Une livraison partielle n'engage que sa
part — et c'est le cas le plus courant.

Une commande annulée ne doit rien, et aucun filtre ne le lui impose : elle n'a
rien pu recevoir, puisqu'une commande déjà livrée ne peut plus être annulée.

**F47 — Le règlement**

Saisi sur la commande, avec les mêmes gestes que le remboursement client
(§45) : un montant, « tout solder » parce que c'est le cas le plus fréquent, le
moyen de paiement et son opérateur (§50), un motif facultatif.

Trois refus, et chacun arrête une erreur réelle : on ne règle pas ce qui n'est
pas arrivé, on ne dépasse pas ce qui reste dû — vérifié par le serveur, parce
que deux vendeurs peuvent régler la même commande en même temps —, et on ne
règle pas une commande annulée.

La carte n'apparaît qu'une fois quelque chose livré. Avant, il n'y a rien à
payer, et un « 0 à payer » se lirait comme une commande gratuite.

**F48 — Le règlement sort de la caisse**

Le journal (§40) porte désormais ces sorties. Ne pas les y voir faisait croire
à une caisse plus pleine qu'elle n'est, le jour précisément où elle venait de
se vider.

Elles n'entrent pas pour autant au compte de résultat (§39) : la marchandise y
est déjà comptée par son coût d'achat, et l'y remettre la compterait deux fois.
C'est la distinction que le §40 pose depuis le début — « où est passé
l'argent ? » n'est pas « combien ai-je gagné ? ».

**F49 — La dette au tableau de bord**

Une tuile « Dettes fournisseurs », en regard des « Créances clients » (§49).
Les deux chiffres se lisent ensemble : ce qu'on me doit, ce que je dois.

Propriétaire seulement, et pas seulement à l'écran — le chiffre est absent de
la réponse du serveur pour un vendeur. Il porte des prix d'achat (§5), et un
écran n'est pas un garde-fou.

**Critères d'acceptation**

1. Une commande sans livraison ne doit rien, quel que soit son total.
2. Une livraison partielle ne doit que sa part, aux prix de la commande.
3. Un règlement qui dépasse le reste dû est refusé par le serveur.
4. Les règlements d'une même commande se cumulent.
5. Une commande soldée ou annulée ne se règle pas.
6. La dette est agrégée par fournisseur ; un fournisseur soldé n'y figure plus.
7. Le règlement apparaît en sortie du journal de caisse, jamais en entrée.
8. Un vendeur ne reçoit pas la dette fournisseur.
9. Rien de tout cela ne franchit la frontière d'une boutique (§29).

## 54. Le ticket de caisse

**Objectif**

Deux imprimantes coexistent dans une quincaillerie. Celle du bureau sort du A4
— la facture qu'on remet à une entreprise, qu'elle classe et passe en charge.
Celle du comptoir est une thermique à rouleau, 58 ou 80 mm de large, qui sort
le ticket que le client met dans sa poche.

L'application ne connaissait que la première. Imprimer sa mise en page sur un
rouleau de 58 mm ne donne pas un ticket plus petit : le navigateur met la page
à l'échelle, et le total devient illisible.

**F50 — Trois formats, un choix retenu**

Facture A4, ticket 80 mm, ticket 58 mm. Le choix est mémorisé : une boutique a
une imprimante, pas trois, et le gérant n'a à choisir qu'une fois. Le stockage
du navigateur peut être vide, refusé ou vidé — toute lecture douteuse rend le
A4, le format qu'on ne peut pas rater.

**F51 — La feuille porte la largeur du rouleau**

La règle `@page` est fabriquée puis injectée le temps de l'impression. Deux
pièges s'y cachent, et tous deux ne se voient qu'une fois le papier sorti :

- **`size: 58mm auto` n'est pas du CSS valide.** C'est pourtant la description
  juste d'un rouleau. `size` accepte une longueur, deux, ou `auto`, jamais un
  mélange : les navigateurs jettent la règle entière et impriment une A4
  écrasée sur 58 mm. La hauteur est donc déclarée — 200 mm, de quoi tenir une
  vingtaine de lignes ; l'imprimante thermique, elle, déroule jusqu'à la fin du
  contenu et coupe là.
- **Le ménage attend `afterprint`, et rien d'autre.** Ni la ligne qui suit
  `print()` — dans plusieurs navigateurs elle s'exécute pendant que l'aperçu
  est encore ouvert —, ni un délai de secours : le gérant laisse volontiers la
  fenêtre d'impression ouverte plus de deux secondes, et la règle disparaîtrait
  sous ses yeux. Là où `afterprint` ne se déclenche pas, c'est l'impression
  suivante qui nettoie la précédente.

**F52 — La mise en page se resserre**

Marges, colonnes et titres se réduisent : une imprimante thermique n'ajuste
rien, elle imprime point par point sur la largeur du rouleau. Et sur 58 mm, la
colonne « Prix » disparaît — il n'y a pas la place pour le prix unitaire *et*
le total de ligne, et c'est le total que le client vérifie.

**Critères d'acceptation**

1. Les trois formats sont proposés sur la facture, et le choix est retenu d'une
   impression à l'autre.
2. La règle de page porte deux longueurs, jamais `auto`.
3. Un ticket de 58 mm sort sur une page de 58 mm, et de 80 sur 80.
4. Après impression, ni la règle ni la mise en page étroite ne subsistent.
5. Le ticket 58 mm n'affiche pas la colonne des prix unitaires.
6. L'en-tête du §51 — logo, numéro fiscal — figure sur le ticket comme sur la
   facture.

## 55. Sortir le rapport de l'écran

**Objectif**

Le §48 a donné trois fichiers : ce que je détiens, ce que j'ai vendu, ce qu'on
me doit. Il manquait le quatrième, et c'est celui qu'on réclame le plus : **ce
que la période m'a rapporté**. L'écran Rapports (§39) calcule le chiffre
d'affaires, la marge, les charges et le bénéfice net — et rien de tout cela ne
sortait nulle part.

Trois destinataires, trois formats. Le comptable veut des colonnes. La banque
et l'associé veulent une feuille. Le gérant, lui, veut parfois simplement
l'historique de son mois sur papier, à classer.

**F53 — Deux CSV, parce que ce sont deux formes**

Le compte de résultat est une suite de postes — un libellé, un montant. La
rentabilité est une ligne par produit, avec dix colonnes. Les empiler dans un
seul fichier décalerait l'un des deux d'une colonne sur l'autre, et c'est
précisément ce qu'un tableur ne sait pas rattraper.

- **Résultat** — ventes en stock, hors stock, recettes hors vente, chiffre
  d'affaires, coût des marchandises vendues, marge brute, une ligne par poste
  de dépense, puis les charges déduites et le bénéfice net. Dans l'ordre de
  l'écran, qui est celui dans lequel le chiffre se construit.
- **Rentabilité** — une ligne par produit : quantité, chiffre d'affaires, coût,
  marge, taux, et la part hors stock comptée à part.

Les dépenses et le coût des marchandises y sont **en négatif**, pour qu'une
somme de colonne tombe sur le bénéfice net. Et l'achat de stock figure sans
être déduit, avec la mention qui dit pourquoi : il est déjà compté par le coût
des marchandises vendues (§39). Le taire laisserait croire à une charge
oubliée.

**F54 — Les fichiers portent la période affichée**

Sans elle, le gérant qui consulte le mois dernier téléchargerait le mois en
cours sans rien remarquer — et s'en apercevrait devant son comptable. La
période est dans les bornes *et* dans le nom du fichier : deux fichiers nommés
pareil finissent en « rapport (3).csv », et plus personne ne sait lequel couvre
quoi.

Sans période demandée, c'est le mois en cours, jamais tout l'historique : un
rapport « depuis l'ouverture » téléchargé par mégarde ne ressemble pas à une
erreur, il ressemble à un très bon mois.

**F55 — Deux pages imprimables**

Le rapport financier et l'historique s'impriment — donc se téléchargent en PDF,
par la même fenêtre que les factures (§54).

Chacune porte l'en-tête du §51, logo et numéro fiscal compris, son titre, et la
période **en toutes lettres** : « Du 01/10/2026 au 23/10/2026 ». « Ce mois »
n'a aucun sens trois semaines plus tard, dans une pochette.

Ce qui ne s'imprime pas : les filtres, les onglets de période, la recherche et
les liens d'action. Sur une feuille, ce sont des mots qu'on ne peut pas
toucher.

**F56 — Ce que l'impression a révélé**

Deux défauts que seule une feuille rendait visibles :

- **L'historique groupait les opérations par jour sans jamais afficher le
  titre du jour.** À l'écran on devinait la journée en lisant les heures ; sur
  papier on ne la devinait plus du tout. Le groupe était calculé depuis le
  début, son titre n'était rendu nulle part.
- **« Hier » ne veut plus rien dire dans une pochette.** Un libellé relatif
  est juste le jour où on le lit, et faux tous les jours suivants. La date
  absolue l'accompagne désormais, à l'écran comme sur la feuille.

**Critères d'acceptation**

1. Le résultat et la rentabilité se téléchargent depuis l'écran Rapports,
   propriétaire seulement : ils portent les coûts d'achat (§5).
2. Les deux fichiers couvrent la période affichée, et la nomment.
3. Sans période, c'est le mois en cours.
4. Les dépenses et le coût des marchandises sont en négatif ; l'achat de stock
   figure sans être déduit, avec sa mention.
5. Un fichier reste lisible sur une période sans aucune vente : les postes sont
   là, à zéro.
6. Les décimales sont des virgules partout, y compris dans la colonne Détail.
7. Le rapport et l'historique s'impriment avec l'en-tête de la boutique et la
   période en clair, sans filtre ni bouton.
8. L'historique affiche le titre de chaque journée, date absolue comprise.

## 56. Des pièces, pas des écrans agrandis

**Objectif**

La facture imprimée était une fiche de téléphone étirée sur une feuille A4 :
tout centré, 60 % de page vide, le client noyé entre le numéro de pièce et la
date, une pastille verte « Payée » et pas un mot de ce qu'une facture doit
porter. Elle ne ressemblait pas à un document — elle ressemblait à une capture
d'écran.

Or c'est la seule chose que le client emporte, et la seule qu'une entreprise
présentera à son comptable.

**F57 — La forme d'une facture**

L'identité du vendeur à gauche, la pièce à droite, séparées du corps par un
filet. C'est la mise en page que tout le monde reconnaît sans la lire, et
c'est ce qui distingue une facture d'un ticket de caisse au premier regard.

Le destinataire reçoit son propre encadré — **Facturé à** — sur une moitié de
largeur. Le vide à sa droite n'est pas perdu : c'est lui qui fait lire le bloc
comme une adresse.

**F58 — Le décompte, et la somme en lettres**

Un bloc aligné à droite : sous-total, remise, **TOTAL** entre deux filets,
montant réglé, reste dû. L'œil descend sans chercher. Le sous-total ne paraît
que s'il y a une remise, et le reste dû que s'il reste quelque chose — « Reste
dû : 0 » sur une facture soldée sème un doute pour rien.

Puis la mention qui rend la facture opposable :

> Arrêtée la présente facture à la somme de **quatre-vingt-huit mille FCFA**.

Ce n'est pas une coquetterie. Un chiffre se retouche au stylo — un 1 devient un
4, un zéro s'ajoute ; une somme en lettres, non. Les administrations et les
entreprises de la zone la réclament, et une facture qui en manque revient au
commerçant. La devise est celle de la boutique (§6), jamais « francs CFA » en
dur.

**F59 — Ce qui ne se photocopie pas n'a rien à faire sur une feuille**

- **Les pastilles de statut deviennent des mentions encadrées, en noir.** Une
  pastille verte sur une photocopie en noir et blanc devient un rectangle gris
  qui ne dit plus rien.
- **Les tuiles pastel du rapport deviennent des encadrés blancs**, sans icône.
- **La bande grise d'en-tête de tableau devient un filet**, et les lignes un
  trait fin : un aplat gris sort sale d'une imprimante à jet.
- **Les boutons, filtres, onglets et liens disparaissent.** Sur une feuille, ce
  sont des mots qu'on ne peut pas toucher.
- **La devise passe en tête de colonne** — « Prix (FCFA) » — plutôt qu'être
  répétée vingt fois.
- **Un pied de page** porte l'identité, le numéro fiscal et la mention qui
  convient : réserve de propriété tant qu'il reste dû, facture acquittée sinon.

**F60 — Une famille de documents**

La facture, le bon de commande, le rapport financier et l'historique partagent
désormais le même en-tête, la même grille, les mêmes filets. Une boutique dont
les pièces se ressemblent est une boutique qu'on reconnaît.

Le bon de commande y gagne son propre bloc **Commande adressée à**, et le
rapport comme l'historique perdent leur en-tête centré d'écran.

**F61 — Le rouleau garde sa forme**

Tout ce qui précède vaut pour la feuille A4, et **seulement** pour elle. Un
en-tête sur deux colonnes imprimé sur 58 mm donnerait deux colonnes de six
caractères. Les règles de la feuille excluent donc explicitement le rouleau,
qui conserve sa pile centrée (§54).

**F62 — La pièce n'est plus l'écran**

La facture est devenue un composant à part, comme l'était déjà le bon de
commande : un document a sa forme propre, qui ne dépend ni de la route qui
l'affiche ni de l'état de chargement autour. C'est aussi ce qui le rend
vérifiable — un test monte la pièce avec une vente, sans routeur.

**Critères d'acceptation**

1. Sur A4, l'identité est à gauche et la pièce à droite ; le destinataire a son
   encadré.
2. Le reste dû n'apparaît que s'il reste quelque chose ; le sous-total, que s'il
   y a une remise.
3. La somme en lettres figure sur toute facture non annulée, dans la devise de
   la boutique.
4. Une vente annulée n'arrête aucune somme et ne se prévaut pas d'avoir été
   payée.
5. Aucun statut ne repose sur une couleur seule.
6. La devise est en tête de colonne, pas sur chaque ligne.
7. Le ticket 58 et 80 mm garde sa mise en page centrée.
8. Les quatre pièces portent le même en-tête.

## 57. Envoyer la facture, pas un résumé

**Objectif**

Le bouton « Partager WhatsApp » existait depuis longtemps. Il envoyait **du
texte** : une liste d'articles et un total. Le client recevait un message, pas
une facture — rien qu'il puisse garder, imprimer ou donner à son comptable. Et
par courriel, rien du tout.

La pièce refaite au §56 ne sortait donc jamais de l'écran du gérant.

**F63 — Un seul constructeur de PDF, deux chemins**

Le téléphone le fabrique pour le partage natif ; le serveur le fabrique pour la
pièce jointe d'un courriel. **Le même module**, isomorphe — deux constructeurs
auraient divergé au premier changement de mise en page, et personne ne l'aurait
vu avant qu'un client ne reçoive une facture d'une autre époque.

La coupure est ailleurs, et c'est elle qui rend la chose vérifiable :

- **Le plan** dit *où* chaque chose se pose, en points PDF, sans rien dessiner.
  Pur, donc testé : qu'aucun bloc ne sorte de la feuille, que le tableau se
  pagine au lieu d'être coupé, que l'en-tête de colonnes se redessine sur
  chaque page, que le décompte ne figure que sur la dernière.
- **Le tracé** pose ce que le plan a placé, et ne décide de rien.

La bibliothèque PDF pèse un demi-mégaoctet : elle est chargée **à la demande**,
au moment où le gérant appuie sur « Envoyer ». Personne ne la télécharge pour
encaisser une vente.

**F64 — Ce qu'une police PDF ne sait pas écrire**

Les polices de base n'encodent que le latin-1, et un nom de produit est du
texte libre. Une émoticône collée dans un libellé ferait échouer le tracé, donc
l'envoi tout entier. Les caractères hors latin-1 sont remplacés : mieux vaut
une facture où un caractère manque qu'une facture qui ne part pas.

**F65 — WhatsApp, avec trois replis**

1. `navigator.share` avec le fichier — Android, iPhone. Le client reçoit le PDF
   dans la conversation.
2. Le navigateur n'en veut pas : le PDF est téléchargé, WhatsApp s'ouvre avec
   le texte, et l'écran explique qu'il reste à le joindre.
3. Rien ne marche : le PDF est téléchargé, ce qui était déjà l'essentiel.

Le repli n'est pas un détail. Un gérant qui appuie sur « Envoyer » et à qui il
ne se passe rien conclut que l'application est cassée.

**F66 — Le courriel**

Un champ **e-mail** apparaît sur les fiches clients — elles n'en avaient pas.
L'adresse est proposée à l'envoi, jamais imposée : une entreprise fait souvent
envoyer ses factures à une comptabilité qui n'est pas la personne venue au
comptoir. L'adresse corrigée n'est pas réenregistrée sur la fiche, sans quoi
une adresse de circonstance deviendrait silencieusement celle du client.

L'application ne parle pas SMTP : un serveur sans adresse fixe voit ses
messages classés en indésirables. Elle confie le message à un expéditeur
(Resend), par deux variables d'environnement et rien dans le code :

```
RESEND_API_KEY   la clé du compte
MAIL_FROM        « Ma Quincaillerie <no-reply@votre-domaine.tg> »
```

Sans elles, la fonctionnalité **se tait proprement et dit quoi configurer**,
plutôt que d'échouer sur un refus illisible au moment où le gérant appuie.

Et quand l'expéditeur refuse — domaine non vérifié, quota dépassé —, sa phrase
est relayée telle quelle. Un envoi annoncé qui n'a pas eu lieu ne se rattrape
jamais.

Une facture annulée ne s'envoie pas : elle ferait croire à une créance.

**Critères d'acceptation**

1. Le PDF envoyé est celui du §56 : même en-tête, même décompte, même somme en
   lettres.
2. La pièce jointe porte la référence de la facture comme nom de fichier.
3. Le tableau se pagine ; aucun bloc ne sort de la feuille.
4. Un caractère hors latin-1 ne fait pas échouer l'envoi.
5. Là où le partage de fichiers n'existe pas, le PDF est téléchargé et l'écran
   le dit.
6. Sans expéditeur configuré, le message nomme les variables à définir.
7. Un refus de l'expéditeur est relayé au gérant, jamais tu.
8. La facture d'une vente annulée ne part pas.
9. Rien de tout cela ne franchit la frontière d'une boutique (§29).

## 58. Trier, corriger, effacer une commande fournisseur

**Objectif**

Depuis le §20 une commande fournisseur ne savait que naître, se recevoir et
s'annuler. Trois manques en découlaient.

La liste d'abord : elle montrait tout, du brouillon de ce matin à la livraison
de l'an dernier, dans un seul fil. Le gérant qui cherche ce qui court encore
devait lire chaque ligne.

La correction ensuite. Une commande se prépare souvent **avant** le coup de fil
au fournisseur : on note vingt sacs, le fournisseur n'en a que quinze, le prix
a bougé. Sans modification, il fallait annuler et tout ressaisir — et la
boutique gardait deux numéros pour une seule commande, dont un fantôme.

L'effacement enfin. Une commande ouverte par erreur, ou sur le mauvais
fournisseur, restait là pour toujours. L'annulation ne répond pas à ce
besoin-là : elle dit « cette commande a existé et ne courra plus », ce qui est
une information. Une saisie fautive n'en est pas une.

**F67 — Ce que la liste sait filtrer**

Trois états, pas sept statuts : **En cours**, **Livrées**, **Annulées**,
**Toutes**. « En cours » vient en premier parce que c'est la seule qui demande
une action. Les statuts internes (brouillon, envoyée, partiellement reçue) se
rangent derrière « En cours » : pour le gérant ce sont tous des articles qui ne
sont pas encore sur l'étagère.

La période s'y croise — tout, 30 jours, ce mois, le mois dernier — par les
mêmes bornes que les rapports (§33), pour qu'une commande comptée ici et là-bas
le soit de la même façon.

Quand un filtre ne laisse rien, l'écran le dit : « Aucune commande ne
correspond à ce filtre. » Sans cette phrase, un gérant resté sur « Annulées »
croit avoir perdu ses commandes.

**F68 — Le verrou, avant toute chose**

Une règle unique, `verrouDeCommande`, décide : elle rend soit `null` — les deux
gestes sont offerts —, soit **la phrase** qui explique le refus. Elle est
appliquée deux fois, à l'écran et sur la route, à partir du même code : une
règle qui ne vit que dans le composant se contourne avec l'outil de
développement du téléphone.

| Situation | Modifier / supprimer | Pourquoi |
|---|---|---|
| Brouillon, envoyée | oui | rien n'a bougé dans la boutique |
| Une réception, même partielle | modification seule | du stock est entré ; la réécrire ferait mentir l'inventaire. La suppression, elle, est rouverte au §65 : elle rend le stock |
| Un règlement fournisseur | non | une dette a été payée contre cette pièce (§54) |
| Annulée | modification seule | l'annulation est la trace voulue ; la suppression, elle, est rouverte au §64 |

Une commande verrouillée n'affiche pas des boutons grisés : elle affiche la
phrase. Un bouton qu'on ne peut pas appuyer n'apprend rien.

**F69 — Modifier, c'est remplacer**

L'enregistrement **remplace** les lignes au lieu de les fusionner. Une
fusion garderait l'article que le gérant vient de retirer : il croirait
l'avoir ôté, le fournisseur le livrerait quand même.

Le **numéro ne change pas**. Il est peut-être déjà parti par WhatsApp, lu au
téléphone, noté sur un cahier. Une correction qui renumérote la commande casse
la seule chose que les deux parties avaient en commun.

La saisie est **celle de la création** (`PurchaseOrderForm`), pas une seconde
page : un champ ajouté d'un côté manquerait de l'autre, et on s'en apercevrait
devant le fournisseur. Une ligne rechargée ne garde que le libellé de son
conditionnement — « sac », « carton » —, parce qu'un bon déjà imprimé ne doit
pas changer si le produit est renommé ; l'identifiant se retrouve dans le
catalogue au rendu.

**F70 — Supprimer, sans corbeille**

La feuille de confirmation nomme la commande, compte ses lignes, dit qu'il n'y
a **pas de corbeille**, et propose l'annulation à la place pour une commande
déjà envoyée au fournisseur. Le geste reste réservé au propriétaire (§31).

Elle s'ouvre **depuis la liste**, là où le gérant voit sa saisie fautive, et
non seulement du fond de la fiche : ouvrir une commande pour l'effacer, c'est
deux écrans pour défaire une faute de frappe. C'est le premier geste par ligne
de l'application ; il est donc posé avec retenue.

La corbeille ne paraît que sur les lignes qu'elle peut vraiment effacer. Pour
le savoir, la liste reçoit avec chaque commande le nombre de ses réceptions,
de ses règlements et de ses lignes : sans ces comptes elle offrirait le geste
partout, pour le voir refusé une fois sur deux. C'est la même règle que la
fiche et que la route, nourrie des mêmes trois nombres.

Au bout d'une ligne, un seul signe : la corbeille **remplace** le chevron là
où elle paraît. Côte à côte, ils se disputaient la largeur et renvoyaient la
date à la ligne — les commandes effaçables devenaient plus hautes que les
autres, et la liste perdait son peigne.

Le bouton reste **hors** du lien de la ligne. Imbriqué, il serait un lien
qu'on déclenche en visant la corbeille.

La même feuille sert aux deux écrans. La phrase qui prévient qu'il n'y a pas
de corbeille ne doit pas exister en deux exemplaires : l'une des deux finirait
par être adoucie sans l'autre.

L'identifiant de boutique reste dans la clé de l'effacement bien que le verrou
ait déjà écarté la commande d'une autre boutique : le §29 veut cet identifiant
dans la clé de toute écriture, jamais dans un simple filtre d'affichage.

**Critères d'acceptation**

1. Chaque état ne montre que les commandes de cet état ; « Toutes » les montre
   toutes.
2. La période écarte ce qui tombe hors de ses bornes, et se croise avec l'état.
3. Un filtre sans résultat l'explique au lieu d'afficher un vide muet.
4. Une commande reçue, réglée ou annulée n'offre ni « Modifier » ni
   « Supprimer », et la phrase dit laquelle des trois.
5. La route refuse le même geste que l'écran, avec la même phrase.
6. Après modification : le numéro est inchangé, les lignes sont celles saisies,
   et aucune ligne retirée ne subsiste.
7. Modifier ne crée ni mouvement de stock ni réception : commander n'est pas
   posséder (§21).
8. Supprimer efface la commande, ses lignes et ses pièces jointes (§59), et
   rien d'autre.
9. La corbeille de la liste ne paraît que sur une commande réellement
   effaçable, et toucher le reste de la ligne ouvre toujours la fiche.
10. La liste supprimée est relue au serveur, jamais corrigée de son côté.
11. Rien de tout cela ne franchit la frontière d'une boutique (§29).


## 59. Joindre la pièce, pas son adresse

**Objectif**

L'écran savait enregistrer un **nom et un lien**. Le commentaire du code le
disait sans détour : « QuincaFlow n'héberge pas les fichiers en V1 : le gérant
colle le lien de la photo qu'il a déjà déposée sur son cloud. »

Personne ne le faisait. Un gérant au comptoir de Lomé n'a pas d'hébergeur ; il
a une facture dans la main et un téléphone dans l'autre. La section
« Documents » restait vide sur toutes les commandes, et la facture du
fournisseur continuait de vivre dans un classeur.

**F71 — Le fichier d'abord, le lien ensuite**

Le bouton ouvre le sélecteur du téléphone : appareil photo, galerie, fichiers.
Sont acceptés le **PDF**, la **photo** (JPEG, PNG, WebP, HEIC), le **Word**
(.doc, .docx), l'**Excel** (.xls, .xlsx), le CSV et le texte.

Le lien reste, replié sous un détail, pour qui range déjà ses pièces dans un
nuage. Les deux saisis, c'est le fichier qui l'emporte : c'est lui qu'on a sous
les yeux.

**Les photos sont réduites avant l'envoi**, comme le justificatif de dépense
(§40). Un cliché moderne pèse quatre mégaoctets et ne part pas d'une connexion
de comptoir ; réduit à 1 600 px, il en pèse deux cents kilo-octets et une
facture A4 s'y lit encore. Le PDF et le Word, eux, ne se réduisent pas : ils
passent tels quels sous la borne, ou sont refusés **tout de suite** plutôt
qu'après une minute d'attente.

**F72 — Où vivent les octets**

Dans Postgres, en `data:` URL, dans la colonne qui portait déjà le lien — comme
le justificatif de dépense (§40) et le logo (§51). Une seule mécanique pour
toute l'application plutôt qu'un service de stockage de plus à provisionner, à
payer et à surveiller.

Ce choix a un plafond, et il faut le nommer : **2,5 Mo par pièce**. Deux bornes
s'y superposent — l'hébergeur refuse une requête au-delà de 4,5 Mo, et le
base64 gonfle d'un tiers ; la base, elle, n'est pas un coffre à archives. Le
jour où les pièces pèseront plus que les ventes, il faudra un stockage
d'objets ; ce jour-là, `mime` et `size_bytes` diront exactement quoi déplacer.

**Le fichier ne voyage jamais avec la commande.** La fiche ne porte que le nom,
le format et le poids de ses pièces ; les octets se demandent à leur propre
route. Sans cela, ouvrir une commande à trois factures scannées coûterait dix
mégaoctets de données mobiles à chaque fois — et le gérant les paie.

**F73 — Une pièce jointe est un fichier qu'un inconnu a écrit**

Trois gardes, parce qu'un fichier servi depuis notre propre domaine est du code
qui s'exécute chez nous :

1. **Le type vient de notre liste, jamais du fichier.** Ce qui n'y figure pas
   est refusé ; ce qui y figure est servi sous le type que *nous* déclarons.
2. **`nosniff`**, pour que le navigateur ne devine pas autre chose.
3. **Tout ce qui n'est ni PDF ni photo se télécharge** au lieu de s'afficher.

C'est pourquoi le **SVG** et le **HTML** sont absents de la liste : ce sont des
documents qui portent du script, et aucun fournisseur n'envoie sa facture en
SVG.

Et la vérification est faite **deux fois** : à l'écran pour refuser tout de
suite avec une phrase utile, sur la route parce que le serveur ne fait jamais
confiance au client (§35).

**F74 — Détacher**

Permettre de joindre sans permettre de retirer, c'est laisser une facture mise
sur la mauvaise commande y rester pour toujours — et son poids avec elle.

Supprimer la commande emporte ses pièces, ce qui n'allait pas de soi :
`documents` ne pointe pas la commande par une clé étrangère mais par un couple
type/identifiant, générique à toute l'application. **Aucune cascade ne les
emportait.** Avant le §59 cela laissait des lignes vides ; depuis, cela aurait
laissé des fichiers.

**Ce que la migration nous a appris**

Les colonnes `mime` et `size_bytes` avaient d'abord été écrites en
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` au bas de `schema.sql`. Les tests
passaient — ils exécutent le fichier en SQL brut sur une base vide.

La production, elle, ne joue pas `schema.sql` : `scripts/db.mjs` le *lit*, et
il ne cherche les colonnes que dans les blocs `CREATE TABLE`. Les deux colonnes
n'auraient donc jamais existé en ligne, et la fonctionnalité serait tombée sur
une colonne absente — avec une suite de tests verte pour dire le contraire.

Une colonne nouvelle se déclare dans son `CREATE TABLE`. Un test le garde
désormais : `schema.sql` ne doit contenir aucun `ALTER TABLE … ADD COLUMN`
isolé.

**Critères d'acceptation**

1. Un PDF, une photo, un Word et un Excel se joignent depuis le téléphone.
2. Une photo est réduite avant l'envoi ; le PDF et le Word partent tels quels.
3. Au-delà de 2,5 Mo, le refus arrive avant l'envoi, et dit le poids.
4. Un SVG, un HTML ou un exécutable sont refusés — à l'écran et sur la route.
5. Le fichier est servi sous le type de notre liste, avec `nosniff`, et seul le
   PDF et la photo s'affichent en place.
6. La fiche d'une commande ne transporte jamais les octets de ses pièces.
7. Chaque ligne dit le format et le poids.
8. Une pièce se détache ; supprimer la commande emporte les siennes.
9. Le lien d'un fichier rangé ailleurs reste possible.
10. `schema.sql` n'ajoute aucune colonne par un `ALTER` isolé.
11. Rien de tout cela ne franchit la frontière d'une boutique (§29) : une pièce
    d'une autre quincaillerie est introuvable, pas masquée.


## 60. Le bon de commande part en pièce, pas en message

**Objectif**

Le partage du bon de commande envoyait **du texte** : une liste d'articles et
un total, dans le corps du message. Lisible sur un téléphone, mais ce n'est pas
une pièce — le fournisseur ne peut ni la classer, ni la signer, ni la donner à
son magasinier. La facture de vente, elle, partait déjà en PDF joint depuis le
§57 : les deux documents de la boutique ne voyageaient pas de la même façon.

**F75 — Le même document, en PDF**

Le PDF copie la pièce imprimée (§56) : même en-tête, mêmes colonnes, mêmes
signatures, même mention de pied. Le fournisseur qui reçoit le fichier et celui
qui reçoit la feuille doivent tenir le même document — sinon le second se
demande lequel fait foi.

Le fichier porte le numéro du bon et rien d'autre : `PO-0042.pdf`. C'est ce que
le fournisseur verra dans sa messagerie.

Le message texte **reste joint au partage** : dans la conversation, il dit de
quoi il s'agit sans qu'on ouvre la pièce, et le PDF reste pour le classeur.

**F76 — Sans prix, ce n'est pas un bon de commande**

Aucun coût saisi : le titre devient **DEMANDE DE PRIX**, les deux colonnes de
montants disparaissent, le total aussi — « 0 FCFA » en bas d'une page se lirait
comme une commande gratuite —, et la clôture demande des prix au lieu d'un
délai. La colonne des quantités prend alors le bord droit : laissée au milieu,
elle donnait un tableau à moitié vide sous un filet qui, lui, allait jusqu'à la
marge, et le fournisseur y cherchait une colonne effacée.

**F77 — Ce que le PDF ajoute à la feuille**

La **somme en lettres** (§55). Un chiffre se retouche sur un PDF transmis ; une
somme écrite en toutes lettres se contredit elle-même.

Les deux **signatures** — le gérant, le fournisseur — se posent en bas de la
feuille et non à la suite du texte : des traits flottant au milieu d'une page à
moitié blanche font un brouillon, pas une pièce. Une commande **annulée** n'en
porte aucune : faire signer un bon annulé reviendrait à le remettre en vigueur.

**F78 — Le bas de la pièce ne se coupe pas**

Total, somme en lettres, observations et signatures forment un bloc. Mesuré
avant d'être écrit : s'il ne tient pas, il passe **entier** à la page suivante.

Sans cela — et c'est ce qu'un PDF rendu a montré, pas le code relu — une
commande de vingt et une lignes donnait une seconde page **blanche portant deux
traits à signer**. Le total tenait sur la première ; les signatures basculaient
seules.

**Ce que les mutants ont appris**

Le premier test écrit contre ce défaut vérifiait qu'« aucune page ne porte que
des signatures ». Il passait — et il passait **aussi** quand on retirait le
correctif, parce que la page blanche n'était qu'un symptôme parmi d'autres de
la mauvaise césure. Trois mutants ont survécu à la première série.

Les tests ont été réécrits sur l'invariant et non sur le symptôme : les traits
à signer tiennent dans l'espace libre entre le dernier texte de la page et le
filet du pied. Les trois mutants meurent.

**F79 — Le projet part aussi en pièce**

Le partage depuis l'**écran de saisie** envoyait encore du texte : la commande
n'a pas de numéro, et une pièce sans numéro se classe mal.

La réserve était juste, la conclusion ne l'était pas. Le geste visé — « as-tu
ça, et à quel prix ? », avant de s'engager — mérite une pièce que le
fournisseur puisse ouvrir sur un ordinateur et faire circuler dans son magasin.
Le risque n'était pas le PDF, c'était un PDF **muet sur son état**.

Le projet le dit donc quatre fois, du plus gros au plus petit caractère :

| Où | Ce qui est écrit |
|---|---|
| Sous le titre | **PROJET — NON ENREGISTRÉ** |
| Dans le bloc d'identification | N° « — », Statut « Projet » |
| Après le total | « Projet de commande — à confirmer avant toute livraison. » |
| En pied de page | « sans numéro : il ne vaut ni commande ni engagement d'achat. Un bon numéroté suivra. » |

Et il **ne porte aucune ligne à signer** : une pièce sans numéro, signée, ne se
retrouve nulle part le jour où l'un des deux la cite.

La formule du total change aussi. « Arrêté le présent bon de commande à la
somme de… » est celle d'une pièce ferme ; sur un projet elle contredirait les
quatre mentions ci-dessus. Le projet dit « Montant estimé : … ».

Le fichier s'appelle `projet-de-commande.pdf` : il ne peut pas porter un numéro
qui n'existe pas.

Techniquement, le plan de page cesse d'exiger une commande enregistrée. Il
accepte une forme plus pauvre — numéro, fournisseur, statut, date,
observations, lignes — que `PurchaseOrder` satisfait telle quelle et que la
saisie en cours sait fabriquer.

**Critères d'acceptation**

1. Le bon de commande part en PDF joint depuis la fiche et depuis le document.
2. Le fichier porte le numéro du bon.
3. Le message texte accompagne la pièce dans le partage.
4. Le PDF dit la même chose que la feuille imprimée.
5. Sans prix : titre, colonnes, total et clôture changent ensemble.
6. La somme est arrêtée en lettres sur un bon chiffré et non annulé.
7. Une commande annulée ne porte pas de signatures.
8. Le bas de la pièce ne se coupe jamais entre le total et les signatures.
9. Le tableau se pagine, l'en-tête de colonnes est redessiné, le total ne
   figure que sur la dernière page.
10. Là où le navigateur ne sait pas joindre un fichier, le PDF est téléchargé
    et WhatsApp s'ouvre avec le texte — l'écran le dit.
11. Un caractère hors latin-1 dans un nom de produit ne fait pas échouer
    l'envoi.
12. Le projet part lui aussi en PDF, et s'annonce comme projet au titre, au
    bloc d'identification, après le total et au pied.
13. Un projet ne porte aucune ligne à signer, et son total n'est pas
    « arrêté ».
14. Le fichier d'un projet ne porte pas de numéro de bon.


## 61. La boutique numérote ses articles

**Objectif**

Le champ « Référence » de la fiche produit était libre et facultatif. Il
restait vide : un catalogue se remplit au comptoir, entre deux clients, et
inventer un code à chaque article n'arrive jamais. Les écrans affichaient donc
« Sans référence » sur presque tout le catalogue.

Une référence n'est pourtant pas un ornement. C'est ce qu'on dicte au
téléphone, ce qu'on écrit sur un bac, ce qu'on cherche au comptoir quand le
nom est long et que le client attend.

**F80 — Attribuée, pas imposée**

Référence laissée vide à la création : la boutique en attribue une —
`ART-0001`, puis `ART-0002`. Le champ reste ouvert : un gérant qui travaille
avec la référence de son fournisseur cherche par elle, et la lui retirer lui
coûterait précisément le geste qu'on veut lui rendre. Le champ le dit :
« Laissez vide et l'application en attribue une (ART-0001). »

Une référence saisie à la main **ne consomme pas de numéro** : le prochain
article attribué reprend la suite là où elle était.

La **modification** ne touche à rien. Une référence déjà dictée, déjà écrite
sur un bac, ne change pas parce qu'on a corrigé un prix.

**F81 — Pourquoi ce compteur-ci se comporte autrement**

Les ventes et les factures tirent leur numéro **dans** la transaction
d'écriture (§20) : une vente refusée n'emporte pas un numéro avec elle, car
une séquence de factures à trous se lit, lors d'un contrôle, comme des
factures effacées.

Pour un article, c'est l'inverse qui est vrai. `ART-0007` jamais attribué ne
raconte rien — une référence nomme une chose, elle ne date pas un acte. Le
compteur est donc incrémenté à part, et cet écart achète une propriété qui
compte : si le gérant a saisi à la main un article nommé `ART-0007`, la
création suivante prend `ART-0008` au lieu de buter indéfiniment sur le même
numéro. Dans la transaction, le compteur serait rejoué à l'identique à chaque
tentative, et la création serait **définitivement bloquée** à ce rang.

**F82 — Une erreur de base de données qu'on peut distinguer**

Reprendre un numéro suppose de reconnaître un doublon de référence parmi les
autres échecs. La couche base traduisait déjà toute violation d'unicité en une
phrase française unique : la reconnaître aurait voulu dire comparer du texte,
qui change au premier remaniement.

Le code Postgres et le nom de la contrainte voyagent désormais avec l'erreur.
L'appelant décide sur eux, pas sur une phrase.

**Critères d'acceptation**

1. Un article créé sans référence en reçoit une, dans l'ordre.
2. Une référence saisie est conservée telle quelle.
3. Une référence saisie ne consomme pas de numéro.
4. Une référence attribuée qui existerait déjà est remplacée par la suivante,
   sans que le gérant ait à le savoir.
5. Chaque boutique a son propre compteur (§29).
6. L'article est trouvable par la référence attribuée.
7. Modifier un article ne change pas sa référence.


## 62. Qui commande, qui signe

**Objectif**

Le bon de commande portait deux traits à signer, surmontés de « Le gérant » et
« Le fournisseur ». Deux étiquettes, aucun nom.

Le nom du fournisseur figurait pourtant déjà sur la pièce, dans l'encadré
« Commande adressée à ». Il manquait là où on le cherche vraiment : au-dessus
du trait. Un bon qui circule entre trois dépôts ne dit pas, sans nom, lequel
des trois doit signer — et côté boutique, il ne dit pas qui a passé la
commande le jour où le fournisseur rappelle.

**F83 — Un champ « Gérant » à la saisie**

Il apparaît sur l'écran de création d'une commande, sous les observations, et
il est **pré-rempli avec le nom du compte qui saisit**. Le cas courant est que
le gérant commande lui-même : lui faire retaper son nom à chaque bon serait un
impôt sur le geste le plus fréquent.

Il reste modifiable, parce qu'un vendeur saisit parfois pour le compte du
patron, et que c'est le patron que le fournisseur attend sur la pièce. Il se
corrige ensuite comme le reste de la commande (§58).

Le nom est enregistré **sur la commande**, pas déduit du compte à l'affichage.
`user_id` dit quel compte a saisi — c'est une trace, elle ne bouge pas ;
`manager_name` dit quel nom porte la pièce, et ce n'est pas toujours le même.

**F84 — Les deux parties nommées**

Sur le PDF comme sur la feuille imprimée, chaque trait porte son nom :

```
Le gérant                       Le fournisseur
Kossi Amegan                    Bâtir Plus
______________                  ______________
```

L'espace pour signer est préservé : sur la feuille, l'écart entre les trois
éléments tombe de 26 à 6 points, sans quoi le trait sortait du cadre à
l'impression.

**Ce que les mutants ont appris**

Un mutant a survécu à la première série : **intervertir les deux noms**. Les
tests vérifiaient que « Kossi Amegan » et « Bâtir Plus » figuraient sur la
pièce, pas sous quelle étiquette. C'est précisément l'erreur qui ferait signer
le fournisseur à la place du gérant.

Le test lit désormais le nom posé treize points sous chaque libellé, à la même
abscisse. Le mutant meurt.

**Critères d'acceptation**

1. Le champ « Gérant » est pré-rempli avec le nom du compte qui saisit.
2. Un nom saisi est conservé ; vide, c'est celui du compte qui s'applique.
3. Il se corrige à la modification, sans changer le numéro du bon.
4. Chaque nom s'imprime sous **son** libellé, sur le PDF et sur la feuille.
5. L'espace pour signer reste.
6. Une commande annulée ne porte toujours aucune signature (§60).


## 63. « Livrée », un statut qui reçoit vraiment

**Objectif**

Le statut administratif d'une commande — brouillon, envoyée, facture reçue,
payée — se posait à la main. La livraison, elle, se constatait : elle venait
des quantités reçues, et le seul chemin pour la déclarer passait par l'écran
de réception, ligne par ligne.

Le cas courant est pourtant « tout est arrivé comme commandé ». Trois gestes
pour le dire, alors que la liste des statuts est là, sous les yeux.

**F85 — Le statut déclenche la réception, il ne la remplace pas**

« Livrée » rejoint les statuts que le gérant pose. C'est le seul de la liste
qui ne soit pas qu'une étiquette : le choisir **reçoit tout ce qui reste**.

Et il le fait par le chemin ordinaire (§21-22), celui du bouton « Marquer
comme livrée ». C'est la décision qui porte tout le reste : écrire le statut à
la main aurait donné une commande dite livrée **sans reçu, sans mouvement de
stock, sans coût d'achat recalculé**. Le stock aurait menti dès la première,
et l'écart se serait découvert à l'inventaire, des semaines plus tard, sans
rien pour l'expliquer.

Trois propriétés en découlent, qui n'ont rien coûté :

| Situation | Ce qui se passe |
|---|---|
| Rien n'est encore arrivé | tout entre, un reçu est créé |
| Trois quarts déjà reçus | seul le dernier quart entre |
| Déjà entièrement reçue | **rien ne bouge** — la choisir deux fois ne double pas le stock |

Le coût d'achat suit la même règle qu'une réception saisie à la main : moyenne
pondérée. Douze sacs à 3 900 et cinquante à 4 100 donnent 4 061,29 — pas
4 100.

« Partiellement livrée » n'entre pas dans la liste : elle se constate, elle ne
se décrète pas. On ne peut pas dire à l'avance de combien.

**F86 — Nommer ce qui va entrer**

Choisir « Livrée » touche au stock. Une liste déroulante mal visée ajouterait
cinquante sacs à l'inventaire sans que rien ne le dise.

Une feuille nomme donc ce qui va entrer, article par article, avant de le
faire — et laisse l'autre porte ouverte : « Saisir des quantités
différentes » rouvre la réception ligne à ligne, pour le jour où tout n'est
pas arrivé.

**Critères d'acceptation**

1. « Livrée » figure parmi les statuts que le gérant pose.
2. La choisir fait entrer en stock tout ce qui reste à livrer.
3. Elle crée un reçu et un mouvement de stock, comme une réception saisie.
4. Le coût d'achat est recalculé en moyenne pondérée.
5. Sur une commande partiellement reçue, seul le reliquat entre.
6. La choisir deux fois ne double pas le stock.
7. Une commande annulée la refuse.
8. L'écran nomme les quantités avant de les faire entrer.
9. Rien de tout cela ne franchit la frontière d'une boutique (§29).


## 64. Effacer une commande annulée

**Objectif**

Le §58 verrouillait **modification et suppression ensemble** sur une commande
annulée, au motif que l'annulation est déjà la trace voulue.

L'argument tient pour la modification : réécrire une commande annulée serait
une résurrection silencieuse. Il ne tient pas pour la suppression, et il
créait un piège — une commande ouverte par erreur, puis **annulée au lieu
d'être effacée**, ne pouvait plus jamais l'être. Elle encombrait la liste à
jamais, et le gérant n'avait aucun moyen de revenir sur son choix.

**F87 — Deux gestes, deux règles**

Une commande annulée ne porte rien, et les deux routes le garantissent :
`updatePurchaseOrderStatus` refuse d'annuler ce qui a déjà été livré,
`recordSupplierPayment` refuse de régler ce qui est annulé. Rien ne dépend
d'elle, donc rien ne s'effondre si elle part.

| État | Modifier | Supprimer |
|---|---|---|
| Brouillon, envoyée | oui | oui |
| **Annulée** | non | **oui** |
| Une réception, même partielle | non | oui, et le stock est rendu (§65) |
| Un règlement fournisseur | non | non |

La règle de suppression ne s'appuie pas sur les routes pour tenir : elle
refuse une commande annulée **qui porterait** une réception ou un règlement,
même si aucun chemin ne permet aujourd'hui d'en fabriquer une. Une garde qui
ne vaut que par une autre garde ne vaut rien le jour où celle-ci change.

**F88 — Ce que la suppression refuse encore**

Une commande **livrée**. Le stock est entré : l'effacer laisserait un
mouvement de stock sans commande pour l'expliquer, et l'inventaire dirait que
cinquante sacs sont arrivés de nulle part. Pour une livraison saisie par
erreur, le geste juste est un ajustement d'inventaire, qui se raconte.

Une commande **réglée**. La suppression emporterait le règlement en cascade,
et avec lui une sortie du journal de caisse.

**Critères d'acceptation**

1. Une commande annulée s'efface, depuis la liste comme depuis sa fiche.
2. Elle ne se modifie toujours pas.
3. Une commande livrée ou réglée ne s'efface pas, et la phrase dit laquelle
   des deux.
4. La règle de suppression refuse une annulée porteuse d'une réception ou
   d'un règlement, sans s'en remettre aux autres routes.


## 65. Supprimer une commande livrée, et rendre le stock

**Objectif**

Le §64 avait rouvert la suppression d'une commande annulée, et laissé fermée
celle d'une commande **livrée** : le stock est entré, l'effacer laisserait un
mouvement sans commande pour l'expliquer.

L'objection portait sur l'inventaire, pas sur le geste. Elle tombe si la
suppression **rend ce qu'elle avait fait entrer**.

**F89 — Effacer, c'est défaire**

Supprimer une commande livrée, c'est dire que la livraison n'a jamais eu lieu.
Alors tout part ensemble :

- le stock **redescend** de ce que la commande y avait fait entrer, par
  produit et en unité de base ;
- les **mouvements de stock** de ses réceptions sont effacés — `stock_movements`
  désigne sa pièce par un couple type/identifiant, comme `documents`, et
  aucune cascade ne les emporterait. Un mouvement sans réception pour le
  justifier serait pire qu'une ligne manquante ;
- les reçus, les lignes et les pièces jointes suivent.

**F90 — Ce qui refuse encore, et pourquoi**

**La marchandise déjà partie.** S'il ne reste pas en stock de quoi rendre, la
suppression est refusée, et la phrase dit l'état réel : « il ne reste que 40
sacs de Ciment, et cette commande en avait fait entrer 100. Une partie est
déjà vendue. »

La contrainte de base arrêterait de toute façon l'écriture — `stock_quantity`
ne peut pas devenir négatif — mais avec la phrase d'une vente ratée, qui ne
dirait rien ici. La garde en amont existe pour le message ; la contrainte
reste le vrai filet.

**Un règlement fournisseur.** L'effacement emporterait une ligne du journal de
caisse (§54). Celui-là tient, et la phrase dit par où sortir : retirer d'abord
le règlement.

**Ce qui n'est pas défait**

Le **coût d'achat moyen**. La réception l'avait recalculé en moyenne pondérée,
et une moyenne ne se renverse pas : repartir en arrière demanderait de
connaître le stock et le coût d'avant, que rien ne conserve. C'est un
indicateur de marge, pas une écriture comptable — la feuille de confirmation
le dit plutôt que de le taire.

**Critères d'acceptation**

1. Une commande livrée s'efface, depuis la liste comme depuis sa fiche.
2. Le stock redescend exactement de ce qu'elle avait fait entrer.
3. Les mouvements de stock de ses réceptions partent avec elle.
4. Si la marchandise est déjà vendue, la suppression est refusée et la phrase
   dit ce qui reste.
5. Un refus ne laisse rien à moitié fait : la commande et le stock sont
   intacts.
6. Une commande réglée refuse toujours, et dit quoi faire.
7. L'écran prévient que le stock va redescendre.


## 66. Les charges qui reviennent

**Objectif**

Le loyer, les salaires, la facture d'électricité. L'application savait déjà les
enregistrer comme dépenses (§39) — mais pas qu'il faudrait **repayer**. Rien
ne rappelait l'échéance, et l'oubli d'un loyer coûte plus cher qu'un article
en rupture.

**F91 — Une charge n'est pas une dépense**

Deux tables, et c'est la décision qui porte le reste.
`recurring_charges` tient **le calendrier** — ce qu'il faudra payer, quand, et
tous les combien. `expenses` tient **l'argent sorti**.

Payer une charge écrit **une dépense ordinaire**. Les rapports, le journal de
caisse et le bénéfice net n'ont rien à apprendre de neuf : il n'y a pas deux
façons de sortir de l'argent, et une charge qui aurait sa propre comptabilité
finirait par diverger de l'autre.

**F92 — Le chrono, pas le calendrier**

L'échéance suivante se compte **depuis le jour du paiement**, non depuis
l'ancienne échéance. Payer les salaires le 11 reporte au 11 du mois suivant.

C'est délibéré, et c'est ce que le gérant attend : payer avec cinq jours de
retard ne doit pas le rappeler cinq jours plus tard — il veut un mois de
tranquillité, pas un rattrapage.

La périodicité est **un nombre de mois** (§67).

**Le 31 est la seule vraie question.** Un mois après le 31 janvier n'existe
pas. La date est ramenée au dernier jour du mois atteint — 28, ou 29 en année
bissextile — plutôt que de déborder sur le 3 mars, ce que fait l'arithmétique
naïve de JavaScript. Sans cela, l'échéance glisserait d'année en année.

**F93 — Ce que le gérant lit**

Pas une date : **des jours**. « En retard de 3 jours », « Dans 4 jours », « À
payer aujourd'hui ». Une date seule oblige à compter, et le retard se perd
dans le calcul.

Les plus pressantes sont en tête, et le tableau de bord — le seul écran qu'on
ouvre tous les jours — porte une carte **« À payer »** pour ce qui est échu ou
dû dans la semaine. Elle passe **avant** le stock faible : un loyer en retard
coûte plus cher qu'un article à réassortir.

**F94 — Payer dit ce qu'il va faire**

La feuille annonce les deux effets avant de les produire : la dépense qui sera
écrite, et la date où passera l'échéance. La seconde surprendrait si on la
taisait — le gérant ne verrait pas pourquoi l'échéance a bougé.

Le montant est modifiable à chaque paiement sans changer celui de la charge :
l'électricité ne coûte pas la même chose deux mois de suite.

Les deux écritures tiennent dans **une seule transaction**. Séparées, un échec
entre elles laisserait soit une dépense sans échéance repoussée — rappel le
lendemain pour un loyer déjà payé —, soit une échéance repoussée sans dépense,
et l'argent sorti ne figurerait nulle part.

**F95 — Ranger plutôt qu'effacer**

Un employé qui part, un bail qui finit : la charge se **range**. Elle ne
rappelle plus, garde son historique, et revient d'un geste. L'effacer est
possible aussi, et les dépenses déjà payées restent — l'argent est sorti,
effacer la promesse n'efface pas le fait.

**Ce que cette section ne fait pas**

**Prévenir téléphone éteint.** Le rappel vit dans l'application : il se voit à
l'ouverture. La notification qui arrive sans qu'on ouvre l'application est
l'objet du §68.

**Critères d'acceptation**

1. Une charge porte un poste, un libellé, un montant, un nombre de mois et la
   date du dernier paiement ; l'échéance en découle (§67).
2. Payer écrit une dépense ordinaire au poste de la charge.
3. L'échéance suivante se compte depuis le jour du paiement.
4. Le report ne déborde jamais sur le mois suivant quand le jour n'existe pas.
5. Le montant payé peut différer du montant habituel sans le changer.
6. Dépense et échéance sont écrites ensemble, ou pas du tout.
7. Les charges sont listées par urgence.
8. Le tableau de bord montre ce qui est échu ou dû dans la semaine.
9. Une charge rangée ne rappelle plus et garde son historique.
10. Effacer une charge n'efface pas les dépenses déjà payées.
11. Rien de tout cela ne franchit la frontière d'une boutique (§29).


## 67. Trois nombres, et l'échéance se calcule

**Objectif**

Le §66 demandait au gérant de **choisir une périodicité dans une liste** —
mensuel, trimestriel, semestriel, annuel, hebdomadaire — puis de **saisir la
prochaine échéance**. Deux fois trop de décisions.

Ranger sa charge dans une case que quelqu'un d'autre a dessinée ne marche pas :
un bail payé tous les deux mois n'entrait dans aucune. Et poser soi-même une
échéance, c'est compter les mois à la place du calcul.

**F96 — Ce que le gérant dit, et ce que l'application en déduit**

Il dit trois choses, toutes des faits :

| Il saisit | Exemple |
|---|---|
| Combien il a payé | 80 000 FCFA |
| Quand il a payé | 11/11/2026 |
| Tous les combien de **mois** | 1 |

L'application calcule le reste : prochaine échéance au **11/12/2026**. Elle
l'annonce avant d'enregistrer, par la même fonction que le serveur — annoncer
une date puis en écrire une autre vaudrait mieux ne rien annoncer.

« Tous les N mois » contient toutes les cases de l'ancienne liste et celles
qu'elle n'avait pas : 1, 2, 3, 6, 12, 18. La phrase se forme toute seule —
« Chaque mois », « Tous les 2 mois », « Chaque année ».

**F97 — Déclarer un paiement, c'est une dépense**

Créer une charge, c'est dire « j'ai payé ». L'argent est sorti : la dépense
est donc écrite, au même poste, à la date déclarée. Une charge qui démarre
sans laisser de trace ferait un trou dans le mois en cours.

Une case permet de ne pas l'écrire, pour le gérant qui a déjà saisi cette
dépense à la main : compter deux fois un loyer fausserait son bénéfice, et
c'est le genre d'erreur qu'on ne remarque qu'au bilan.

**Critères d'acceptation**

1. La périodicité est un nombre de mois, pas une case dans une liste.
2. L'échéance est calculée depuis la date de paiement déclarée.
3. L'écran annonce l'échéance calculée avant d'enregistrer.
4. Un nombre de mois absurde — zéro, décimal — est ramené à un mois entier.
5. Créer une charge écrit la dépense déclarée, sauf refus explicite.


## 68. Le rappel qui arrive sans qu'on ouvre l'application

**Objectif**

Le §66 prévenait **à l'ouverture**. Un gérant qui n'ouvre pas son application
le jour de l'échéance n'était prévenu de rien — et c'est précisément ce
jour-là qu'il faut l'être.

**F98 — Quatre pièces, et chacune peut manquer sans tout casser**

| Pièce | Rôle |
|---|---|
| Le service worker | reçoit la notification, l'affiche, ouvre l'écran au clic |
| L'abonnement | un navigateur sur un appareil, enregistré côté serveur |
| L'envoi | signé avec les clés VAPID, par le service du navigateur |
| Le déclencheur quotidien | décide chaque matin quoi envoyer, à qui |

Sans clés configurées, **tout se tait proprement et le dit** — comme l'envoi
de courriel du §57. Le bouton annonce « pas encore configurés » au lieu
d'échouer sur un refus illisible.

**F99 — « Sur cet appareil », pas « pour moi »**

C'est un **navigateur** qu'on abonne, pas un compte. Le gérant qui ouvre
l'application sur son téléphone et sur l'ordinateur de la boutique doit
l'activer deux fois — et le libellé le dit, sans quoi il croirait avoir activé
ce qui ne l'est qu'à moitié.

L'adresse donnée par le service de distribution est la clé unique : un
réabonnement ne crée pas de doublon, et un gérant qui réautorise trois fois ne
reçoit pas trois notifications identiques.

**F100 — Ce qui se répare tout seul, et ce qui ne doit pas**

Un abonnement que le navigateur a oublié répond **410** ou **404** : il est
retiré. Sans cela, le serveur réessaierait chaque matin jusqu'à la fin des
temps une adresse qui ne répondra plus jamais.

Une panne passagère — réseau de comptoir, service injoignable — est comptée
mais **l'abonnement reste**. Le supprimer priverait le gérant de ses rappels
pour une coupure de trente secondes.

**F101 — Le déclencheur est la seule route sans session**

Elle touche **toutes les boutiques**. Elle est donc gardée par un secret, et
**sans ce secret elle refuse tout le monde** plutôt que de s'ouvrir : une
route qui réveille tous les téléphones de tous les gérants ne doit pas
dépendre d'une variable qu'on a oublié de poser.

**F102 — La phrase du rappel**

Une seule charge : on la nomme — c'est ce qui fait agir. Plusieurs : on
compte, car une notification tronquée au milieu d'une liste ne dit rien. Le
montant total vient en second : il dit s'il faut passer à la banque avant
d'ouvrir.

Une étiquette stable fait que le rappel du jour **remplace** celui d'hier. Un
gérant parti trois jours ne doit pas retrouver douze notifications identiques.

**Deux défauts trouvés en essayant, pas en relisant**

**`web-push` est un module CommonJS.** L'import dynamique ne posait rien sur
`.default`, et l'envoi éclatait sur un `undefined` — chaque matin, dans un
travail que personne ne regarde. Les deux formes sont désormais acceptées.

**`navigator.serviceWorker.ready` ne se résout jamais** tant qu'aucun service
worker n'est actif : au premier chargement le temps qu'il s'installe, et
toujours en développement où il n'est pas enregistré. L'attente est bornée ;
au-delà, l'écran propose d'activer plutôt que de rester figé sur un bouton
mort — punir le gérant d'une lenteur qui n'est pas la sienne.

**Ce que l'hébergeur et les navigateurs imposent**

Le déclencheur ne tourne qu'**une fois par jour** : le rappel part à heure
fixe le jour de l'échéance, pas à la minute près. Et sur **iPhone**, les
notifications n'arrivent que si l'application a été ajoutée à l'écran
d'accueil ; sur Android, dès l'autorisation donnée.

**Critères d'acceptation**

1. Sans clés, la fonctionnalité s'annonce indisponible au lieu d'échouer.
2. Un navigateur s'abonne et se désabonne des deux côtés à la fois.
3. Un réabonnement ne crée pas de doublon.
4. Le déclencheur refuse quiconque n'a pas le secret, et refuse tout le monde
   si le secret n'est pas posé.
5. Il n'envoie rien quand aucune charge n'est échue.
6. Un abonnement mort est retiré ; un abonnement en panne est conservé.
7. Le rappel nomme la charge seule, compte au-delà.
8. L'écran ne reste jamais figé sur un bouton inerte sans l'expliquer.
