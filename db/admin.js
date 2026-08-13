// CRUD de cardápio e listagem de mesas para o painel admin.
// Tudo grava/lê Postgres. O admin.html antigo só listava QR estáticos;
// este módulo alimenta as rotas /api/admin/* (ver plano, passo 6).
const pool = require('./pool');

class ErroAdmin extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------------

async function listMesas() {
  const { rows } = await pool.query(
    `SELECT m.id, m.numero, m.token, m.status,
            s.id AS sessao_id, s.valor_total, s.aberta_em, s.cliente_nome
     FROM mesas m
     LEFT JOIN mesa_sessoes s ON s.mesa_id = m.id AND s.status = 'aberta'
     ORDER BY m.numero`
  );
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    token: r.token,
    status: r.sessao_id ? 'ocupada' : r.status,
    sessaoAberta: Boolean(r.sessao_id),
    sessaoId: r.sessao_id || null,
    valorTotal: r.valor_total != null ? Number(r.valor_total) : null,
    abertaEm: r.aberta_em || null,
    clienteNome: r.cliente_nome || null,
  }));
}

// ---------------------------------------------------------------------------
// Cardápio completo (inclui produtos indisponíveis — diferente do público)
// ---------------------------------------------------------------------------

async function getCardapioAdmin() {
  const { rows: categorias } = await pool.query(
    'SELECT id, nome, ordem FROM categorias ORDER BY ordem, id'
  );
  const { rows: produtos } = await pool.query(
    `SELECT id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne
     FROM produtos ORDER BY id`
  );
  const { rows: adicionais } = await pool.query(
    'SELECT id, produto_id, nome, preco FROM adicionais ORDER BY id'
  );
  const { rows: removiveis } = await pool.query(
    'SELECT produto_id, ingrediente FROM produtos_ingredientes_removiveis ORDER BY produto_id, ingrediente'
  );

  return categorias.map((cat) => ({
    id: cat.id,
    nome: cat.nome,
    ordem: cat.ordem,
    produtos: produtos
      .filter((p) => p.categoria_id === cat.id)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        preco: Number(p.preco),
        fotoUrl: p.foto_url,
        disponivel: p.disponivel,
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

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

async function criarCategoria({ nome, ordem = 0 }) {
  const n = String(nome || '').trim();
  if (!n) throw new ErroAdmin(400, 'Nome da categoria é obrigatório');
  const { rows } = await pool.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id, nome, ordem',
    [n, Number(ordem) || 0]
  );
  return rows[0];
}

async function atualizarCategoria(id, { nome, ordem }) {
  const campos = [];
  const vals = [];
  let i = 1;
  if (nome !== undefined) {
    const n = String(nome).trim();
    if (!n) throw new ErroAdmin(400, 'Nome da categoria não pode ser vazio');
    campos.push(`nome = $${i++}`);
    vals.push(n);
  }
  if (ordem !== undefined) {
    campos.push(`ordem = $${i++}`);
    vals.push(Number(ordem) || 0);
  }
  if (!campos.length) throw new ErroAdmin(400, 'Nada para atualizar');
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE categorias SET ${campos.join(', ')} WHERE id = $${i} RETURNING id, nome, ordem`,
    vals
  );
  if (!rows[0]) throw new ErroAdmin(404, 'Categoria não encontrada');
  return rows[0];
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

async function criarProduto(body) {
  const nome = String(body.nome || '').trim();
  const categoriaId = Number(body.categoriaId);
  const preco = Number(body.preco);
  if (!nome) throw new ErroAdmin(400, 'Nome do produto é obrigatório');
  if (!categoriaId) throw new ErroAdmin(400, 'categoriaId é obrigatório');
  if (Number.isNaN(preco) || preco < 0) throw new ErroAdmin(400, 'Preço inválido');

  const { rows } = await pool.query(
    `INSERT INTO produtos (categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne`,
    [
      categoriaId,
      nome,
      body.descricao ? String(body.descricao).trim() : null,
      preco,
      body.fotoUrl || null,
      body.disponivel !== false,
      Boolean(body.pedePontoCarne),
    ]
  );
  const p = rows[0];
  return {
    id: p.id,
    categoriaId: p.categoria_id,
    nome: p.nome,
    descricao: p.descricao,
    preco: Number(p.preco),
    fotoUrl: p.foto_url,
    disponivel: p.disponivel,
    pedePontoCarne: p.pede_ponto_carne,
    adicionais: [],
    removiveis: [],
  };
}

async function atualizarProduto(id, body) {
  const campos = [];
  const vals = [];
  let i = 1;

  if (body.nome !== undefined) {
    const n = String(body.nome).trim();
    if (!n) throw new ErroAdmin(400, 'Nome não pode ser vazio');
    campos.push(`nome = $${i++}`);
    vals.push(n);
  }
  if (body.descricao !== undefined) {
    campos.push(`descricao = $${i++}`);
    vals.push(body.descricao ? String(body.descricao).trim() : null);
  }
  if (body.preco !== undefined) {
    const preco = Number(body.preco);
    if (Number.isNaN(preco) || preco < 0) throw new ErroAdmin(400, 'Preço inválido');
    campos.push(`preco = $${i++}`);
    vals.push(preco);
  }
  if (body.fotoUrl !== undefined) {
    campos.push(`foto_url = $${i++}`);
    vals.push(body.fotoUrl || null);
  }
  if (body.disponivel !== undefined) {
    campos.push(`disponivel = $${i++}`);
    vals.push(Boolean(body.disponivel));
  }
  if (body.pedePontoCarne !== undefined) {
    campos.push(`pede_ponto_carne = $${i++}`);
    vals.push(Boolean(body.pedePontoCarne));
  }
  if (body.categoriaId !== undefined) {
    campos.push(`categoria_id = $${i++}`);
    vals.push(Number(body.categoriaId));
  }

  if (!campos.length) throw new ErroAdmin(400, 'Nada para atualizar');
  vals.push(id);

  const { rows } = await pool.query(
    `UPDATE produtos SET ${campos.join(', ')} WHERE id = $${i}
     RETURNING id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne`,
    vals
  );
  if (!rows[0]) throw new ErroAdmin(404, 'Produto não encontrado');
  const p = rows[0];
  return {
    id: p.id,
    categoriaId: p.categoria_id,
    nome: p.nome,
    descricao: p.descricao,
    preco: Number(p.preco),
    fotoUrl: p.foto_url,
    disponivel: p.disponivel,
    pedePontoCarne: p.pede_ponto_carne,
  };
}

// ---------------------------------------------------------------------------
// Adicionais
// ---------------------------------------------------------------------------

async function criarAdicional(produtoId, { nome, preco }) {
  const n = String(nome || '').trim();
  const p = Number(preco);
  if (!n) throw new ErroAdmin(400, 'Nome do adicional é obrigatório');
  if (Number.isNaN(p) || p < 0) throw new ErroAdmin(400, 'Preço inválido');

  const { rows: prod } = await pool.query('SELECT id FROM produtos WHERE id = $1', [produtoId]);
  if (!prod[0]) throw new ErroAdmin(404, 'Produto não encontrado');

  const { rows } = await pool.query(
    'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1, $2, $3) RETURNING id, produto_id, nome, preco',
    [produtoId, n, p]
  );
  return { id: rows[0].id, produtoId: rows[0].produto_id, nome: rows[0].nome, preco: Number(rows[0].preco) };
}

async function removerAdicional(id) {
  const { rowCount } = await pool.query('DELETE FROM adicionais WHERE id = $1', [id]);
  if (!rowCount) throw new ErroAdmin(404, 'Adicional não encontrado');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ingredientes removíveis
// ---------------------------------------------------------------------------

async function setRemoviveis(produtoId, ingredientes) {
  const lista = Array.isArray(ingredientes)
    ? [...new Set(ingredientes.map((x) => String(x).trim()).filter(Boolean))]
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: prod } = await client.query('SELECT id FROM produtos WHERE id = $1', [produtoId]);
    if (!prod[0]) throw new ErroAdmin(404, 'Produto não encontrado');

    await client.query('DELETE FROM produtos_ingredientes_removiveis WHERE produto_id = $1', [produtoId]);
    for (const ing of lista) {
      await client.query(
        'INSERT INTO produtos_ingredientes_removiveis (produto_id, ingrediente) VALUES ($1, $2)',
        [produtoId, ing]
      );
    }
    await client.query('COMMIT');
    return { produtoId, removiveis: lista };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  ErroAdmin,
  listMesas,
  getCardapioAdmin,
  criarCategoria,
  atualizarCategoria,
  criarProduto,
  atualizarProduto,
  criarAdicional,
  removerAdicional,
  setRemoviveis,
};
