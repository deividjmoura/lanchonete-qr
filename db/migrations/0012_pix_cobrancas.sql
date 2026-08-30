-- Cobranças PIX via gateway PagBank (confirmação automática por webhook)
CREATE TABLE IF NOT EXISTS pix_cobrancas (
  id              SERIAL PRIMARY KEY,
  sessao_id       INTEGER NOT NULL REFERENCES mesa_sessoes(id) ON DELETE CASCADE,
  order_id        TEXT NOT NULL UNIQUE,
  reference_id    TEXT NOT NULL,
  valor_centavos  INTEGER NOT NULL CHECK (valor_centavos > 0),
  status          TEXT NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'PAID', 'CANCELED', 'EXPIRED', 'ERROR')),
  qr_text         TEXT,
  qr_png_url      TEXT,
  charge_id       TEXT,
  end_to_end_id   TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  pago_em         TIMESTAMPTZ,
  raw_webhook     JSONB
);

CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_sessao ON pix_cobrancas (sessao_id);
CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_status ON pix_cobrancas (status);

COMMENT ON TABLE pix_cobrancas IS 'Cobranças PIX dinâmicas (PagBank Orders API)';
