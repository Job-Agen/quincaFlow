# Ajouter une fonctionnalité à QuincaFlow

Comment on ajoute quelque chose à une application déjà en production, dans ce
dépôt précisément — avec ses chemins, ses commandes et ses pièges.

> Ce document est né d'une panne. Les écrans Dépenses, Rapports financiers et
> Journal de caisse (§39, §40) sont partis en production avec un code sain, vers
> une base de données qui ne connaissait pas la table `expenses`. Les trois ont
> répondu `500` pendant que les dix autres fonctionnaient. Rien dans les traces
> de construction ne l'annonçait, et le déploiement était vert.

---

## La règle

> **Le schéma monte avant le code. Le code redescend avant le schéma.**

Une application déployée, c'est deux choses qui vivent séparément : le code et la
base. **Déployer ne met à jour que le code.** La base ne bouge que si on la
touche, explicitement, et c'est un geste distinct.

Pour ajouter une fonctionnalité : la base d'abord, le code ensuite. Comme le
schéma n'est fait que d'ajouts, l'ancien code continue de tourner sans rien voir
des nouvelles tables — la fenêtre entre les deux est sans danger.

Dans l'autre sens elle casse, et c'est ce qui est arrivé.

Pour revenir en arrière, l'ordre s'inverse : le code d'abord. La base peut
rester en avance indéfiniment — une table que personne n'interroge ne gêne
personne.

---

## Les dix étapes

### 1. Écrire l'exigence avant le code

Un nouveau paragraphe dans `docs/prd.md`, numéroté **à la suite**.

**Ne jamais renuméroter** : soixante-quatorze commentaires du code renvoient aux
sections par leur numéro (« §12 », « §29 »). Un décalage les ferait tous mentir
d'un coup, sans qu'aucun test ne s'en aperçoive.

Écrire l'exigence avant le code n'est pas une formalité. C'est en rédigeant les
critères d'acceptation du §38 qu'on a découvert que le quatrième n'était pas
tenu : sans réseau, l'application renvoyait le gérant à l'écran de connexion
alors que sa session était valide.

### 2. Une branche

```bash
git checkout -b claude/journal-de-caisse
```

La production continue de tourner pendant ce temps.

### 3. Le schéma, et seulement en ajout

Si la fonctionnalité a besoin de données nouvelles, ajouter à la fin de
`schema.sql`, en `CREATE TABLE IF NOT EXISTS` et `CREATE INDEX IF NOT EXISTS`.

**Ne jamais modifier une instruction déjà partie en production.** Une table qui
existe chez un commerçant ne se recrée pas : `IF NOT EXISTS` la saute en silence,
et l'application échoue à l'exécution sur des colonnes absentes. La changer
demande un `ALTER TABLE`, qui est un autre geste et une autre prudence.

Mettre les règles métier dans les contraintes quand c'est possible :

```sql
stock_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)
```

Cette ligne-là est ce qui rend une survente impossible, même si un écran oublie
de la vérifier.

### 4. Le métier, puis ses tests

`src/domain/` — les calculs purs : ni base, ni écran, ni requête. C'est le seul
endroit où l'arithmétique des montants a le droit d'exister, et `mobile/`
importe ces fichiers mêmes (§41) : une correction vaut pour le web et pour
l'application native.

Écrire le test en même temps, et **le confronter au code d'avant** : un test vert
du premier coup ne prouve rien. Rétablir l'ancien comportement, vérifier qu'il
échoue, puis remettre le correctif.

### 5. Le serveur

`src/server/` pour les requêtes. Une écriture qui touche plusieurs tables passe
par `runTransaction([...])` : une vente enregistrée dont le stock n'aurait pas
bougé ne doit pas pouvoir exister (§12).

Le pilote HTTP de Neon est **non interactif** — aucune requête du tableau ne peut
lire le résultat d'une autre. C'est pourquoi les identifiants sont générés côté
application (`src/lib/ids.ts`) : connaître l'id d'une vente avant de l'insérer
est ce qui permet d'écrire la vente, ses lignes, son paiement et ses mouvements
de stock dans la même transaction.

### 6. L'API

`src/app/api/`. Les routes lisent la session, valident l'entrée, appellent le
serveur. Toute requête porte `business_id` : le cloisonnement entre boutiques
(§29) ne se délègue pas à l'écran.

### 7. Les écrans

`src/app/` pour le web, `mobile/app/` pour le natif. Les deux appellent les mêmes
routes d'API.

Un écran doit dire ce que son chiffre vaut. Un bénéfice net calculé sans aucune
dépense saisie est une marge brute, et le taire reviendrait à annoncer au gérant
un gain déjà dépensé.

### 8. Vérifier, et pas seulement par les tests

```bash
npm test          # 147 tests, dont 41 d'intégration sur un vrai PostgreSQL
npm run typecheck
npm run lint
npm run build
```

Les tests d'intégration **s'ignorent en silence** sans base. Pour qu'ils tournent
vraiment :

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/quinca_test npm test
```

Vérifier le compte affiché : `147 passed`, pas `106 passed | 41 skipped`.

Puis lancer l'application et la piloter pour de vrai, à 390 px. C'est ce qui a
attrapé le cumul fautif de l'anneau des dépenses, le catalogue reforgé à chaque
frappe, et le bénéfice net écrit avec un trait d'union là où ses propres lignes
portaient le signe moins.

### 9. ⚠️ La base de production, AVANT le code

**L'étape qui manquait.**

```bash
DATABASE_URL="<chaîne de production>" npm run db:check   # dit ce qui manque
DATABASE_URL="<chaîne de production>" npm run db:apply   # le crée
```

`db:check` compare les **colonnes**, pas seulement les noms de tables. C'est ce
qui lui permet de refuser d'avancer sur une base dont une table porte le bon nom
et la mauvaise forme — le cas de l'ancienne base de QuincaFlow, dont `users`,
`products`, `sales`, `expenses` et `stock_movements` sont en
`id, user_id, data jsonb`.

Ses codes de sortie : `0` rien à faire, `1` il y a du travail ou un conflit de
forme, `2` configuration absente.

### 10. Déployer, puis vérifier

Fusionner dans `master` ; Vercel construit et publie.

Vérifier ensuite en production, et pas seulement que les pages répondent :

```bash
curl -s https://quincaflow.vercel.app/api/health
```

**Attention au verdict de cette sonde.** Elle n'exécute qu'un `SELECT 1`, qui
réussit sur n'importe quelle base. Elle dit que la connexion aboutit, pas que le
schéma est à jour — c'est `db:check` qui le dit. Pendant toute la panne, elle a
répondu `{"status":"ok"}`.

Le vrai contrôle est un parcours : créer une dépense, ouvrir les rapports,
recompter à la main.

---

## Ce que la CI vérifie déjà

`.github/workflows/ci.yml`, sur chaque pull request :

| | |
| --- | --- |
| `npm run lint`, `format:check` | style |
| `npm run typecheck` | types, tests compris — `next build` ne couvre que ce qu'il rend |
| `npm run build` | **sans `DATABASE_URL` ni `JWT_SECRET`** : si le build réclame un secret, c'est qu'une lecture de base a glissé dans le rendu statique |
| `npm ci` + `tsc` dans `mobile/` | le partage du domaine avec l'application native ne se rompt pas en silence |
| `npm test` sur un PostgreSQL 16 | atomicité, contraintes de stock, cloisonnement |
| un garde dédié | exige que la suite d'intégration **se soit exécutée**, car `npm test` reste vert quand elle s'ignore |

Ce que la CI **ne vérifie pas** : l'état de la base de production. Aucune
intégration continue ne peut deviner vers quelle base pointe `DATABASE_URL`.
C'est l'étape 9, et elle est manuelle.

---

## Le piège du renommage

Le nom de la base n'est **nulle part dans le code** : `src/lib/db.ts` ne lit que
`process.env.DATABASE_URL`. Il vit uniquement dans la chaîne de connexion.

Renommer une base côté Neon ne déplace aucune donnée, mais invalide toute chaîne
qui la nomme. Le nouveau nom se reporte dans `DATABASE_URL` — sur Vercel
(*Production* **et** *Preview*) et dans le `.env.local` de chaque poste. Tant que
ce n'est pas fait, `/api/health` répond `degraded`.

---

## Mémo

```bash
git checkout -b claude/<fonctionnalite>    # 2
# §n dans docs/prd.md                      # 1
# CREATE TABLE IF NOT EXISTS → schema.sql  # 3
# src/domain + tests, src/server, src/app  # 4-7
TEST_DATABASE_URL=… npm test               # 8
npm run typecheck && npm run lint && npm run build
DATABASE_URL="<prod>" npm run db:check     # 9 — AVANT de déployer
DATABASE_URL="<prod>" npm run db:apply
git push -u origin claude/<fonctionnalite> # 10
```
