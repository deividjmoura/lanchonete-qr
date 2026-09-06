-- 0012_ordem_produtos.sql
-- Ordem manual de produtos dentro de cada categoria (espelha categorias.ordem).
-- Backfill: sequencial por categoria usando id atual como base estável.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

-- Preenche ordem por categoria (0, 1, 2…) na ordem atual (id).
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY categoria_id ORDER BY id) - 1)::INTEGER AS nova_ordem
  FROM produtos
)
UPDATE produtos p
SET ordem = ranked.nova_ordem
FROM ranked
WHERE p.id = ranked.id;
