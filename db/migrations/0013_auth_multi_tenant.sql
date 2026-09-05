-- 0013_auth_multi_tenant.sql
-- Papel super_admin global (sem estabelecimento) + staff de loja continua com estabelecimento_id.

-- Permitir super_admin no CHECK de papel (nome da constraint pode variar)
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_papel_check;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'staff'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%papel%'
  ) THEN
    -- já dropamos staff_papel_check; tenta nomes legados
    NULL;
  END IF;
END $$;

-- Remove qualquer CHECK residual em papel
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'staff'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%papel%'
  LOOP
    EXECUTE format('ALTER TABLE staff DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE staff
  ADD CONSTRAINT staff_papel_check
  CHECK (papel IN ('admin', 'cozinha', 'caixa', 'super_admin'));

-- super_admin pode ter estabelecimento_id NULL
ALTER TABLE staff
  ALTER COLUMN estabelecimento_id DROP NOT NULL;

-- Regras:
-- - super_admin → estabelecimento_id IS NULL
-- - demais → estabelecimento_id IS NOT NULL
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_tenant_required;
ALTER TABLE staff
  ADD CONSTRAINT staff_tenant_required CHECK (
    (papel = 'super_admin' AND estabelecimento_id IS NULL)
    OR (papel <> 'super_admin' AND estabelecimento_id IS NOT NULL)
  );
