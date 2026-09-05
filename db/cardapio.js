// Cardápio público, lido do Postgres, com cache em memória por tenant.
const pool = require('./pool');
const { resolveEstabelecimentoId } = require('./tenant');

const CARDAPIO_TTL_MS = Number(process.env.CARDAPIO_CACHE_TTL_MS || 30_000);

/** @type {Map<number, { data: any, at: number }>} */
const cacheByTenant = new Map();

async function carregarCardapio(estabelecimentoId) {
  const eid = await resolveEstabelecimentoId(estabelecimentoId);
  const { rows: categorias } = await pool.query(
    'SELECT id, nome, ordem FROM categorias WHERE estabelecimento_id = $1 ORDER BY ordem',
    [eid]
  );
  const { rows: produtos } = await pool.query(
    `SELECT p.id, p.categoria_id, p.nome, p.descricao, p.preco, p.foto_url, p.pede_ponto_carne
     FROM produtos p
     JOIN categorias c ON c.id = p.categoria_id
     WHERE c.estabelecimento_id = $1
       AND p.disponivel = TRUE
       AND (p.controla_estoque = false OR p.estoque IS NULL OR p.estoque > 0)
     ORDER BY p.id`,
    [eid]
  );
  const { rows: adicionais } = await pool.query(
    `SELECT a.id, a.produto_id, a.nome, a.preco
     FROM adicionais a
     JOIN produtos p ON p.id = a.produto_id
     JOIN categorias c ON c.id = p.categoria_id
     WHERE c.estabelecimento_id = $1
     ORDER BY a.id`,
    [eid]
  );
  const { rows: removiveis } = await pool.query(
    `SELECT r.produto_id, r.ingrediente
     FROM produtos_ingredientes_removiveis r
     JOIN produtos p ON p.id = r.produto_id
     JOIN categorias c ON c.id = p.categoria_id
     WHERE c.estabelecimento_id = $1`,
    [eid]
  );

  return categorias.map((cat) => ({
    id: cat.id,
    nome: cat.nome,
    produtos: produtos
      .filter((p) => p.categoria_id === cat.id)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        preco: Number(p.preco),
        fotoUrl: p.foto_url,
        pedePontoCarne: p.pede_ponto_carne,
        adicionais: adicionais
          .filter((a) => a.produto_id === p.id)
          .map((a) => ({ id: a.id, nome: a.nome, preco: Number(a.preco) })),
        removiveis: removiveis
          .filter((r) => r.produto_id === p.id)
          .map((r) => r.ingrediente),
      })),
  }));
}

async function getCardapio(estabelecimentoId) {
  const eid = await resolveEstabelecimentoId(estabelecimentoId);
  const hit = cacheByTenant.get(eid);
  if (hit && Date.now() - hit.at < CARDAPIO_TTL_MS) {
    return hit.data;
  }
  const data = await carregarCardapio(eid);
  cacheByTenant.set(eid, { data, at: Date.now() });
  return data;
}

function invalidarCardapio(estabelecimentoId) {
  if (estabelecimentoId != null) {
    const n = Number(estabelecimentoId);
    if (Number.isFinite(n)) cacheByTenant.delete(n);
    return;
  }
  cacheByTenant.clear();
}

module.exports = { getCardapio, invalidarCardapio };
