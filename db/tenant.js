// Helpers mínimos de tenant (issue schema). Isolamento completo vem depois.
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

function clearTenantCache() {
  cachedPadraoId = null;
}

module.exports = {
  getEstabelecimentoPadraoId,
  clearTenantCache,
};
