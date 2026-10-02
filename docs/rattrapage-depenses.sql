-- Rattrapage pour Dépenses (§40), Rapports financiers (§39) et Journal de caisse (§40).
--
-- À exécuter sur la base que la production utilise réellement.
--
-- Rien n'est supprimé ni modifié : chaque instruction est en IF NOT EXISTS, donc
-- une table déjà présente est laissée telle quelle. Le script peut être relancé
-- sans risque. C'est un extrait de schema.sql, qui peut aussi être exécuté en
-- entier — il est idempotent de la même façon.

CREATE TABLE IF NOT EXISTS documents (
  id             text PRIMARY KEY,
  business_id    text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind           text NOT NULL,
  reference_type text NOT NULL,
  reference_id   text NOT NULL,
  name           text NOT NULL,
  url            text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_ref_idx ON documents (business_id, reference_type, reference_id);

CREATE TABLE IF NOT EXISTS expenses (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  category    text NOT NULL DEFAULT 'OTHER',
  label       text NOT NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount >= 0),
  spent_on    date NOT NULL DEFAULT CURRENT_DATE,
  note        text,
  user_id     text REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_business_date_idx ON expenses (business_id, spent_on DESC);
