// Helpers de tenant (schema + isolamento + path /loja/{slug}).
const pool = require('./pool');

let cachedPadraoId = null;

/** ID do estabelecimento slug=padrao (cache em processo). */
async function getEstabelecimentoPadraoId() {
  if (cachedPadraoId != null) return cachedPadraoId;
  const { rows } = await pool.query(
    `SELECT id FROM estabelecimentos WHERE slug = 'padrao' LIMIT 1`
  );
  if (!rows[0]) {
    throw new Error('estabelecimento padrao não encontrado — rode npm run db:migrate');
  }
  cachedPadraoId = rows[0].id;
  return cachedPadraoId;
}

/**
 * Resolve o tenant a usar nas queries.
 * Aceita: number | string numérica | staff com estabelecimentoId | null → padrao.
 */
async function resolveEstabelecimentoId(explicit) {
  if (explicit != null && typeof explicit === 'object' && explicit.estabelecimentoId != null) {
    return Number(explicit.estabelecimentoId);
  }
  if (explicit != null && explicit !== '') {
    const n = Number(explicit);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return getEstabelecimentoPadraoId();
}

async function getEstabelecimentoPorSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  const { rows } = await pool.query(
    `SELECT id, nome, slug, logo_url, tema, ativo
     FROM estabelecimentos WHERE slug = $1 LIMIT 1`,
    [s]
  );
  return rows[0] || null;
}

/** Mesa + dados do estabelecimento (por token UUID). */
async function getMesaPorTokenComTenant(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const { rows } = await pool.query(
    `SELECT m.id, m.numero, m.status, m.token, m.estabelecimento_id,
            e.slug, e.nome AS estabelecimento_nome, e.ativo AS estabelecimento_ativo
     FROM mesas m
     JOIN estabelecimentos e ON e.id = m.estabelecimento_id
     WHERE m.token = $1
     LIMIT 1`,
    [t]
  );
  return rows[0] || null;
}

/**
 * Garante que a mesa existe, a loja está ativa e (se slug informado) bate com a URL.
 * @returns {object} row da mesa
 * @throws {{ status: number, message: string }}
 */
async function assertMesaAcesso(token, slugOptional) {
  const mesa = await getMesaPorTokenComTenant(token);
  if (!mesa) {
    const err = new Error('Mesa não encontrada');
    err.status = 404;
    throw err;
  }
  if (!mesa.estabelecimento_ativo) {
    const err = new Error('Estabelecimento inativo');
    err.status = 403;
    throw err;
  }
  if (slugOptional) {
    const s = String(slugOptional).trim().toLowerCase();
    if (s && mesa.slug !== s) {
      const err = new Error('Mesa não pertence a este estabelecimento');
      err.status = 403;
      throw err;
    }
  }
  return mesa;
}

function clearTenantCache() {
  cachedPadraoId = null;
}

module.exports = {
  getEstabelecimentoPadraoId,
  resolveEstabelecimentoId,
  getEstabelecimentoPorSlug,
  getMesaPorTokenComTenant,
  assertMesaAcesso,
  clearTenantCache,
};
