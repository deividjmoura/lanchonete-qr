-- 0014_staff_senha_rotacao.sql
-- Rastreamento de rotação de senha: quando foi trocada pela última vez e
-- se uma troca obrigatória está pendente (reset forçado por admin/super_admin).

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS senha_deve_trocar BOOLEAN NOT NULL DEFAULT FALSE;
