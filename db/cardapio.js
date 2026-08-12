// Cardápio público, lido do Postgres. Substitui o /api/menu antigo (que
// lia data/db.json) para as rotas novas — o endpoint antigo continua
// existindo em paralelo até o front ser migrado (ver plano, passo 5).
const pool = require('./pool');

async function getCardapio() {
  const { rows: categorias } = await pool.query(
    'SELECT id, nome, ordem FROM categorias ORDER BY ordem'
  );
  const { rows: produtos } = await pool.query(
    `SELECT id, categoria_id, nome, descricao, preco, foto_url, pede_ponto_carne
     FROM produtos WHERE disponivel = TRUE ORDER BY id`
  );
  const { rows: adicionais } = await pool.query(
    'SELECT id, produto_id, nome, preco FROM adicionais ORDER BY id'
  );
  const { rows: removiveis } = await pool.query(
    'SELECT produto_id, ingrediente FROM produtos_ingredientes_removiveis'
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

module.exports = { getCardapio };
