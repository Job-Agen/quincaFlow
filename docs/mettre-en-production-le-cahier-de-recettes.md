# Mettre le cahier de recettes en production (§42)

Le code est écrit, testé et poussé. Il reste **une** chose à faire, et elle est
sur la base de données, pas dans le code.

## Pourquoi je ne peux pas la faire moi-même

Le `DATABASE_URL` de production est un secret Vercel : je peux voir qu'il existe,
pas ce qu'il contient. J'ai cherché la base dans votre compte Neon — projet
`quincaFlow`, bases `neondb` et `neondb_v1` — et ce n'est ni l'une ni l'autre :
une tentative de connexion ratée envoyée à la production n'y a laissé aucune
trace dans `login_attempts`, alors qu'elle en laisse toujours deux. La production
tourne donc sur une base que je ne peux pas atteindre d'ici.

## Ce qu'il manque : une table

Une seule, `incomes`. Les 21 autres sont déjà là.

## La façon la plus simple

Depuis une copie du dépôt, avec le `DATABASE_URL` de production :

```sh
DATABASE_URL='…'  npm run db:check    # dit ce qui manque, n'écrit rien
DATABASE_URL='…'  npm run db:apply    # crée ce qui manque, ne touche à rien
```

`schema.sql` n'est fait que de `CREATE … IF NOT EXISTS` : aucune donnée n'est
lue, modifiée ni supprimée, et rejouer la commande sur une base déjà à jour ne
fait rien.

J'ai vérifié ces deux commandes sur une base remise dans l'état exact de la
production — les 21 tables, sans `incomes`. `db:check` annonce
« Tables absentes : incomes » ; `db:apply` exécute 44 instructions et la base
correspond ensuite au schéma.

## Ou, dans l'éditeur SQL de Neon

```sql
CREATE TABLE IF NOT EXISTS incomes (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  category    text NOT NULL DEFAULT 'OTHER',
  label       text NOT NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount >= 0),
  received_on date NOT NULL DEFAULT CURRENT_DATE,
  note        text,
  user_id     text REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incomes_business_date_idx ON incomes (business_id, received_on DESC);
```

## Pourquoi la table d'abord, et le déploiement après

Le cahier n'est pas le seul écran concerné : les **rapports financiers** et le
**journal de caisse** lisent désormais `incomes` eux aussi, pour y prendre la
part des recettes qui est du chiffre d'affaires et les entrées de caisse hors
vente. Promouvoir le code sur une base sans la table ne casserait pas seulement
le nouvel écran : elle casserait ces deux-là, qui marchent aujourd'hui.

C'est la règle écrite dans `docs/ajouter-une-fonctionnalite.md` :
**le schéma monte avant le code, le code redescend avant le schéma.**

## Puis le déploiement

Le dernier commit (`7f9c99d`) est déjà construit sur Vercel, en préproduction :
`quincaflow-k6dmxhria-john-maxwells-projects.vercel.app`. La production est
restée sur `0e06c5e`. Une fois la table créée, il suffit de promouvoir ce
déploiement — dites-le moi et je le fais, ou faites-le depuis le tableau de bord
Vercel (Deployments → le déploiement → Promote to Production).

Les préproductions, elles, n'ont aucun `DATABASE_URL` : seule la production en a
un. C'est pourquoi on ne peut pas essayer l'écran sur l'URL de préproduction.
