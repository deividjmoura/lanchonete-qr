-- 0012_estabelecimentos.sql
-- Multi-tenant foundation: estabelecimentos + estabelecimento_id nas tabelas-raiz.
-- Dados existentes passam a pertencer ao estabelecimento padrão (slug = padrao).
-- Isolamento de queries / auth multi-loja ficam em issues seguintes.

-- ---------------------------------------------------------------------------
-- estabelecimentos (tenants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estabelecimentos (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  logo_url    TEXT,
  tema        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT estabelecimentos_slug_unique UNIQUE (slug),
  CONSTRAINT estabelecimentos_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE INDEX IF NOT EXISTS idx_estabelecimentos_ativo ON estabelecimentos (ativo);

-- Estabelecimento padrão (loja única atual)
INSERT INTO estabelecimentos (nome, slug, tema, ativo)
VALUES ('Padrão', 'padrao', '{}'::jsonb, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- mesas
-- ---------------------------------------------------------------------------
ALTER TABLE mesas
  ADD COLUMN IF NOT EXISTS estabelecimento_id INTEGER REFERENCES estabelecimentos(id) ON DELETE RESTRICT;

UPDATE mesas m
SET estabelecimento_id = e.id
FROM estabelecimentos e
WHERE e.slug = 'padrao' AND m.estabelecimento_id IS NULL;

ALTER TABLE mesas
  ALTER COLUMN estabelecimento_id SET NOT NULL;

-- numero único por estabelecimento (não global)
ALTER TABLE mesas DROP CONSTRAINT IF EXISTS mesas_numero_key;
DROP INDEX IF EXISTS mesas_numero_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mesas_estabelecimento_numero
  ON mesas (estabelecimento_id, numero);

CREATE INDEX IF NOT EXISTS idx_mesas_estabelecimento
  ON mesas (estabelecimento_id);

-- ---------------------------------------------------------------------------
-- categorias
-- ---------------------------------------------------------------------------
ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS estabelecimento_id INTEGER REFERENCES estabelecimentos(id) ON DELETE RESTRICT;

UPDATE categorias c
SET estabelecimento_id = e.id
FROM estabelecimentos e
WHERE e.slug = 'padrao' AND c.estabelecimento_id IS NULL;

ALTER TABLE categorias
  ALTER COLUMN estabelecimento_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categorias_estabelecimento
  ON categorias (estabelecimento_id);

-- ---------------------------------------------------------------------------
-- garcons
-- ---------------------------------------------------------------------------
ALTER TABLE garcons
  ADD COLUMN IF NOT EXISTS estabelecimento_id INTEGER REFERENCES estabelecimentos(id) ON DELETE RESTRICT;

UPDATE garcons g
SET estabelecimento_id = e.id
FROM estabelecimentos e
WHERE e.slug = 'padrao' AND g.estabelecimento_id IS NULL;

ALTER TABLE garcons
  ALTER COLUMN estabelecimento_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_garcons_estabelecimento
  ON garcons (estabelecimento_id);

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS estabelecimento_id INTEGER REFERENCES estabelecimentos(id) ON DELETE RESTRICT;

UPDATE staff s
SET estabelecimento_id = e.id
FROM estabelecimentos e
WHERE e.slug = 'padrao' AND s.estabelecimento_id IS NULL;

-- staff de loja: estabelecimento obrigatório (super_admin global virá depois com NULL)
ALTER TABLE staff
  ALTER COLUMN estabelecimento_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_estabelecimento
  ON staff (estabelecimento_id);

-- login continua UNIQUE global nesta etapa (simples; multi-login por loja pode relaxar depois)
