# QuincailPro → Gestion de Boutique Générale — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter l'application pour qu'elle gère une boutique généraliste : paramétrage (nom, devise, catégories), sauvegarde export/import, suivi des crédits clients, annulation de ventes, journal des mouvements de stock, achats fournisseurs, rapports comptables par période, README et tests.

**Architecture:** Next.js 15 App Router, JavaScript, données en localStorage via `src/storage/index.js`. Pattern existant : 1 route App Router → 1 vue cliente dans `src/views/` → hooks CRUD dans `src/hooks/` (clés `qp_*`). Le plan est découpé en 3 phases : Phase 1 (scaffolding par l'orchestrateur : hooks partagés, navigation, routes) ; Phase 2 (4 agents en parallèle sur des fichiers **strictement disjoints**) ; Phase 3 (intégration, lint, build, commit).

**Tech Stack:** Next.js 15, React 18, lucide-react, recharts, vitest (à installer).

## Global Constraints

- Langue de l'UI : **français** exclusivement.
- Style : styles inline + `COLORS`/`FONTS` de `src/constants/theme.js` (pas de Tailwind, pas de CSS module).
- Composants UI existants à réutiliser : `Card`, `Button`, `Badge`, `Input`, `Select`, `Modal` dans `src/components/ui/`.
- Monnaie : toujours via `fmt()` de `src/utils/formatCurrency.js`, jamais de concaténation manuelle.
- IDs : `crypto.randomUUID()`.
- Clés localStorage : préfixe `qp_`.
- Chaque agent ne modifie QUE les fichiers listés dans sa tâche. Interdiction absolue de toucher `Sidebar.jsx`, `BottomNav.jsx`, `package.json`, ou les fichiers d'un autre agent.
- `'use client'` en tête de toute vue/composant utilisant des hooks.
- Commits fréquents avec messages `feat:`/`fix:`/`docs:`/`test:`.
- **Exécution parallèle (Phase 2) : les agents A/B/C/D ne lancent AUCUNE commande `git`** (risque de course sur l'index avec 4 agents dans le même worktree) — l'orchestrateur commite chaque tâche après revue, avec le message indiqué dans la tâche.

---

## Contrats de données (référence pour toutes les tâches)

### Clés localStorage existantes

| Clé | Forme |
|---|---|
| `qp_products` | `[{ id, name, cat, buyPrice, sellPrice, qty, unit, minQty, createdAt }]` |
| `qp_sales` | `[{ id, date(ISO), items:[{name, qty, unitPrice}], total, clientName, payment('cash'\|'mobile money'\|'crédit'), contactId?, status?('annulée') }]` |
| `qp_expenses` | `[{ id, date('YYYY-MM-DD'), cat, description, amount }]` |
| `qp_contacts` | `[{ id, name, phone, address, type('client'\|'fournisseur'), creditBalance }]` |
| `qp_invoices` | `[{ id, number('FAC-YYYY-NNNN'), status('en attente'\|'payée'), amountPaid, total, createdAt, ... }]` |

### Nouvelles clés (créées en Phase 1)

| Clé | Forme |
|---|---|
| `qp_settings` | `{ storeName, tagline, currency, productCategories:[], expenseCategories:[], units:[] }` |
| `qp_stock_movements` | `[{ id, date(ISO), productId, productName, type('entrée'\|'sortie'\|'ajustement'), qty(nombre signé), reason, refId? }]` |
| `qp_purchases` | `[{ id, date(ISO), supplierId?, supplierName, items:[{productId, name, qty, unitCost}], total, status('commandé'\|'reçu'), receivedAt? }]` |
| `qp_credit_payments` | `[{ id, date(ISO), contactId, amount, note }]` |

### Hooks partagés créés en Phase 1 (à consommer tels quels, ne pas modifier)

```js
// src/hooks/useSettings.js
useSettings() → { settings, saveSettings(partial), DEFAULT_SETTINGS }
// settings = { storeName:'Ma Boutique', tagline:'Gestion de boutique', currency:'FCFA',
//   productCategories:[...], expenseCategories:[...], units:[...] }

// src/hooks/useStockMovements.js
useStockMovements() → { movements, logMovement({productId, productName, type, qty, reason, refId}) }

// src/hooks/usePurchases.js
usePurchases() → { purchases, addPurchase(data), receivePurchase(id), deletePurchase(id) }
// receivePurchase passe status à 'reçu' + receivedAt — la mise à jour du stock est faite par la vue Achats (Tâche C)

// src/hooks/useCredits.js
useCredits() → { payments, addPayment({contactId, amount, note}), deletePayment(id) }
```

---

## PHASE 1 — Scaffolding (orchestrateur, séquentiel)

### Task 0: Commit de sauvegarde

- [x] `git add -A && git commit -m "chore: baseline avant refonte boutique générale"` — fait (commit `8e8ab18`)

### Task 1: Hooks partagés + settings + devise dynamique

**Files:**
- Create: `src/hooks/useSettings.js`, `src/hooks/useStockMovements.js`, `src/hooks/usePurchases.js`, `src/hooks/useCredits.js`
- Modify: `src/utils/formatCurrency.js` (devise lue depuis `qp_settings`, cache module + `setCurrency()`)
- Modify: `src/constants/categories.js` (exports renommés en `DEFAULT_*` avec alias rétrocompatibles ; catégories généralistes ajoutées : Alimentation, Boissons, Hygiène & Entretien, Cosmétiques, Papeterie, Électronique, Textile, Quincaillerie, Autres)

**Interfaces:** Produit les 4 hooks du contrat ci-dessus. `fmt(value)` inchangé côté appelant.

- [x] Écrire les 4 hooks sur le modèle de `useProducts` (useState initialisé depuis storage + useEffect de persistance) — fait (commit `49cd813`)
- [x] `fmt()` : cache module `cachedCurrency`, initialisé paresseusement depuis `qp_settings.currency`, export `setCurrency(c)` appelé par `saveSettings` — fait
- [x] Commit `feat: hooks settings/mouvements/achats/credits + devise dynamique` — fait

### Task 2: Navigation + routes + stubs de vues

**Files:**
- Modify: `src/components/layout/Sidebar.jsx` (3 entrées : `/credits` HandCoins « Crédits », `/achats` Truck « Achats », `/parametres` Settings « Paramètres » ; titre = `settings.storeName`, sous-titre = `settings.tagline`)
- Modify: `src/components/layout/BottomNav.jsx` (mêmes entrées, labels courts)
- Create: `src/app/credits/page.jsx`, `src/app/achats/page.jsx`, `src/app/parametres/page.jsx` (chacune rend la vue correspondante)
- Create: `src/views/Credits.jsx`, `src/views/Achats.jsx`, `src/views/Parametres.jsx` (stubs `'use client'` avec titre de page — remplacés en Phase 2)
- Modify: `src/app/layout.jsx` (metadata title « Gestion de Boutique »)
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)

- [x] Vérifier `npm run lint` puis `npm run build` passent — fait
- [x] Commit `feat: routes credits/achats/parametres + navigation + vitest` — fait (commit `49cd813`)

---

## PHASE 2 — 4 agents en parallèle (fichiers disjoints)

### Task A: Paramètres, sauvegarde export/import, seed généraliste, README

**Files (propriété exclusive de l'agent A):**
- Modify: `src/views/Parametres.jsx` (remplacer le stub)
- Create: `src/utils/backup.js`
- Create: `src/utils/__tests__/backup.test.js`
- Modify: `src/components/layout/SeedData.jsx`
- Create: `README.md`

**Interfaces:**
- Consomme : `useSettings()` (contrat Phase 1), `storage` (`src/storage/index.js`), composants UI.
- Produit : `exportAll() → objet {version:1, exportedAt, data:{...toutes les clés qp_*}}`, `importAll(obj) → {ok, error?}` (valide `version` et `data`, écrit chaque clé), `resetAll()` (supprime toutes les clés `qp_*`).

**Spécification Parametres.jsx :**
- Section « Boutique » : champs nom, slogan, devise (texte libre, ex. FCFA, €, MAD) → `saveSettings`.
- Section « Catégories produits » et « Catégories dépenses » : liste éditable (ajout via Input + bouton, suppression par croix), persistée dans settings.
- Section « Données » : bouton **Exporter (JSON)** (télécharge `boutique-sauvegarde-YYYY-MM-DD.json` via Blob + lien), **Importer** (input file JSON → `importAll` → `window.location.reload()`), **Réinitialiser** (Modal de confirmation → `resetAll` → reload).
- Section « À propos » : version, rappel que les données sont locales au navigateur.

**Spécification SeedData.jsx :** remplacer les produits de quincaillerie par ~8 produits de boutique généraliste (Riz 25kg, Huile 5L, Savon, Lait en poudre, Boisson gazeuse, Cahier, Pile AA, Recharge téléphonique…) avec les nouvelles catégories généralistes ; contacts et ventes de démo cohérents ; ne seed que si `qp_products` est vide (logique existante).

**Spécification README.md :** présentation, fonctionnalités par module, stack, `npm install` / `npm run dev` / `lint` / `test`, avertissement stockage local + conseil d'export régulier.

**État initial :** `src/utils/backup.js` existe déjà (non commité) et respecte le contrat ci-dessus (`BACKUP_KEYS` couvre les 9 clés `qp_*`) — le vérifier/compléter, ne pas le réécrire. `vitest` et `jsdom` sont déjà dans `package.json`, mais **`vitest.config.js` n'existe pas** : le créer avec `test: { environment: 'jsdom' }`.

**Steps :**
- [x] Créer `vitest.config.js` (environment jsdom)
- [x] Test vitest de `exportAll`/`importAll` : export→import restitue les données, import d'un objet invalide retourne `{ok:false}`, `resetAll` supprime toutes les clés
- [x] Vérifier `backup.js` existant contre le contrat, vérifier `npx vitest run` passe (14 tests verts)
- [x] Implémenter la vue Parametres, le nouveau SeedData, le README
- [x] Commit `feat: parametres boutique + export/import + seed generaliste + README`

### Task B: Crédits clients + annulation de vente

**Files (propriété exclusive de l'agent B):**
- Modify: `src/views/Credits.jsx` (remplacer le stub)
- Modify: `src/views/Caisse.jsx`
- Modify: `src/hooks/useSales.js`

**Interfaces:**
- Consomme : `useCredits()`, `useContacts()` (`updateCredit(id, delta)` existe déjà), `useStockMovements().logMovement`, `useProducts().adjustStock(id, delta)`.
- Produit : `useSales` gagne `cancelSale(id)` → marque `status:'annulée'` (ne supprime pas) et retourne la vente annulée.

**Spécification Credits.jsx :**
- KPI : total des créances (somme des `creditBalance` des contacts type client), nombre de débiteurs.
- Tableau des clients avec `creditBalance > 0` : nom, téléphone, solde, bouton « Encaisser » → Modal (montant ≤ solde, note) → `addPayment` + `updateCredit(contactId, -montant)`.
- Historique des remboursements (liste `payments` triée par date desc, avec suppression possible qui recrédite le solde).
- Les ventes à crédit existantes (payment `'crédit'`) listées par client pour traçabilité.

**Spécification Caisse.jsx (modifications ciblées, ne pas réécrire le fichier) :**
1. Paiement « crédit » ⇒ sélection d'un contact client **obligatoire** (Select alimenté par `useContacts`, filtré `type==='client'`, avec création rapide d'un client par nom+téléphone). Enregistrer `contactId` sur la vente et faire `updateCredit(contactId, +total)`.
2. Dans l'historique des ventes du jour : bouton « Annuler » → Modal de confirmation → `cancelSale(id)` + restitution du stock de chaque item (`adjustStock(productId, +qty)` — retrouver le produit par nom si la vente n'a pas de productId) + `logMovement({type:'entrée', qty:+qty, reason:'Annulation vente', refId:saleId})` + si paiement crédit, `updateCredit(contactId, -total)`. Les ventes `status==='annulée'` s'affichent barrées avec Badge rouge et sont exclues des totaux.
3. À la confirmation d'une vente (`handleConfirmSale`, après la déduction du stock) : capter le retour de `addSale(...)` et journaliser une sortie par article du panier : `logMovement({productId: item.id, productName: item.name, type:'sortie', qty: item.qty, reason:'Vente en caisse', refId: newSale.id})`.

**Steps :**
- [x] Ajouter `cancelSale` à `useSales` (même pattern `useCallback` + `storage.set`)
- [x] Implémenter la vue Credits puis les modifications Caisse
- [x] `npm run lint` sur les fichiers touchés
- [x] Commit `feat: suivi credits clients + annulation de vente`

### Task C: Mouvements de stock + achats fournisseurs

**Files (propriété exclusive de l'agent C):**
- Modify: `src/views/Achats.jsx` (remplacer le stub)
- Modify: `src/views/Stock.jsx`

**Interfaces:**
- Consomme : `usePurchases()`, `useStockMovements()`, `useProducts()` (`adjustStock`, `updateProduct`, `products`), `useContacts()` (fournisseurs), `useSettings()` (catégories produits).
- Produit : rien de nouveau côté API — comportement seulement.

**Spécification Achats.jsx :**
- Formulaire nouvelle commande : fournisseur (Select contacts `type==='fournisseur'` + saisie libre), lignes {produit existant (Select) OU nouveau produit (nom + catégorie + unité + prix), qty, unitCost}, total calculé → `addPurchase(status:'commandé')`.
- Liste des commandes avec Badge statut ; bouton « Réceptionner » sur les commandes `'commandé'` → `receivePurchase(id)` + pour chaque item : si produit existant `adjustStock(productId, +qty)` et mise à jour du `buyPrice` via `updateProduct`, sinon création du produit via `addProduct` ; et `logMovement({type:'entrée', qty:+qty, reason:'Réception achat', refId:purchaseId})`.
- KPI : total achats du mois, commandes en attente.

**Spécification Stock.jsx (modifications ciblées) :**
1. Remplacer l'usage des catégories statiques par `useSettings().settings.productCategories`.
2. Tout ajustement manuel de stock passe par un Modal demandant un **motif** (Select : Inventaire, Casse, Perte/Vol, Correction, Autre) → `adjustStock` + `logMovement({type:'ajustement', qty:delta, reason})`.
3. Nouvel onglet/section « Mouvements » : journal `movements` trié par date desc (date, produit, type avec Badge coloré — entrée verte, sortie rouge, ajustement ambre —, quantité signée, motif).

**Steps :**
- [x] Implémenter Achats.jsx puis les modifications Stock.jsx
- [x] `npm run lint`
- [x] Commit `feat: achats fournisseurs + journal des mouvements de stock`

### Task D: Rapports comptables par période + généralisation Dashboard/Dépenses

**Files (propriété exclusive de l'agent D):**
- Modify: `src/views/Comptabilite.jsx`
- Modify: `src/views/Dashboard.jsx`
- Modify: `src/views/Depenses.jsx`
- Modify: `src/utils/dateHelpers.js` (ajouts uniquement, ne rien renommer)

**Interfaces:**
- Consomme : `qp_sales`, `qp_expenses`, `qp_purchases`, `qp_credit_payments` (lecture directe `storage.get(clé, [])` ou hooks), `useSettings()`.
- Produit : dans `dateHelpers.js` : `getMonthRange(date) → {start, end}`, `isInRange(iso, start, end) → bool` (ajouts append-only).

**Spécification Comptabilite.jsx :**
- Sélecteur de période : boutons prédéfinis (7 jours, Ce mois, Mois dernier, Cette année) + deux Input type date (du / au).
- Sur la période : CA (ventes non annulées — exclure `status==='annulée'`), marge brute (somme (unitPrice − buyPrice du produit correspondant) × qty, retrouver le produit par nom), dépenses, achats reçus, bénéfice net = marge − dépenses ; encaissements par mode de paiement ; créances en cours.
- Bouton « Imprimer le bilan » → `window.print()` (même approche que Facturation.jsx:765).

**Spécification Dashboard.jsx :** exclure les ventes annulées des KPIs et du graphique ; ajouter carte « Créances clients » (somme des creditBalance) ; utiliser `useSettings` pour le nom de la boutique dans l'en-tête s'il est affiché.

**Spécification Depenses.jsx :** catégories depuis `useSettings().settings.expenseCategories` au lieu de la constante statique.

**Steps :**
- [x] Ajouter les helpers de dates (append-only) 
- [x] Implémenter Comptabilite, puis Dashboard, puis Depenses
- [x] `npm run lint`
- [x] Commit `feat: rapports comptables par periode + generalisation dashboard/depenses`

---

## PHASE 3 — Intégration (orchestrateur)

### Task 3: Vérification finale

- [x] `npm run lint` — 0 erreur (9 avertissements non bloquants, patterns préexistants)
- [x] `npm run build` — succès (10 routes générées)
- [x] `npx vitest run` — 14 tests verts
- [x] Smoke test : `npm run dev` — les 10 routes s'affichent, la vente à crédit du seed crée une créance de 37 000 FCFA visible dans /credits, la réception d'un achat augmente le stock (8→58) + met à jour le prix d'achat + journalise le mouvement, l'export JSON produit un fichier valide (~7 Ko), l'annulation d'une vente restitue le stock, solde la créance, exclut la vente des totaux et journalise un mouvement « Annulation vente »
- [x] Commit final `chore: integration boutique generale`

## Hors périmètre (phase ultérieure, nécessite décisions/comptes utilisateur)

- Base de données (Supabase/Postgres) et authentification multi-utilisateurs — nécessite création de compte et clés API par l'utilisateur.
- PWA / synchronisation hors-ligne.
