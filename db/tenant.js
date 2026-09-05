// Helpers de tenant. Isolamento de queries usa resolveEstabelecimentoId.
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

function clearTenantCache() {
  cachedPadraoId = null;
}

module.exports = {
  getEstabelecimentoPadraoId,
  resolveEstabelecimentoId,
  clearTenantCache,
};
