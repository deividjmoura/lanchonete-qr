// CRUD de cardápio e listagem de mesas para o painel admin.
const pool = require('./pool');
const {
  getEstabelecimentoPadraoId,
  resolveEstabelecimentoId,
  assertPertenceAoTenant,
} = require('./tenant');

function normalizeFotoUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  // data-URL (foto otimizada no Postgres — sobrevive a redeploy)
  if (/^data:image\/(webp|jpeg|jpg|png|gif);base64,/i.test(s)) {
    if (s.length > 400000) {
      throw new ErroAdmin(413, 'Foto em base64 muito grande (máx ~300 KB otimizado)');
    }
    return s;
  }
  if (s.startsWith('/') && !s.startsWith('//')) return s.slice(0, 500);
  if (/^https?:\/\//i.test(s)) return s.slice(0, 2000);
  throw new ErroAdmin(
    400,
    'URL da foto inválida (use upload no admin, https://… ou /caminho)'
  );
}

class ErroAdmin extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function listMesas(estabelecimentoId) {
  const eid = await resolveEstabelecimentoId(estabelecimentoId);
  const { rows } = await pool.query(
    `SELECT m.id, m.numero, m.token, m.status,
            s.id AS sessao_id, s.valor_total, s.aberta_em, s.cliente_nome,
            e.slug AS estabelecimento_slug
     FROM mesas m
     JOIN estabelecimentos e ON e.id = m.estabelecimento_id
     LEFT JOIN mesa_sessoes s ON s.mesa_id = m.id AND s.status = 'aberta'
     WHERE m.estabelecimento_id = $1
     ORDER BY m.numero`,
    [eid]
  );
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    token: r.token,
    slug: r.estabelecimento_slug,
    status: r.sessao_id ? 'ocupada' : r.status,
    sessaoAberta: Boolean(r.sessao_id),
    sessaoId: r.sessao_id || null,
    valorTotal: r.valor_total != null ? Number(r.valor_total) : null,
    abertaEm: r.aberta_em || null,
    clienteNome: r.cliente_nome || null,
  }));
}

function mapProdutoRow(p) {
  return {
    id: p.id,
    categoriaId: p.categoria_id,
    nome: p.nome,
    descricao: p.descricao,
    preco: Number(p.preco),
    fotoUrl: p.foto_url,
    disponivel: p.disponivel,
    pedePontoCarne: p.pede_ponto_carne,
    controlaEstoque: Boolean(p.controla_estoque),
    estoque: p.estoque != null ? Number(p.estoque) : null,
    estoqueMinimo: Number(p.estoque_minimo || 0),
    estoqueBaixo: Boolean(p.controla_estoque) && p.estoque != null && Number(p.estoque) <= Number(p.estoque_minimo || 0),
  };
}

async function getCardapioAdmin(estabelecimentoId) {
  const eid = await resolveEstabelecimentoId(estabelecimentoId);
  const { rows: categorias } = await pool.query(
    'SELECT id, nome, ordem FROM categorias WHERE estabelecimento_id = $1 ORDER BY ordem, id',
    [eid]
  );
  const { rows: produtos } = await pool.query(
    `SELECT p.id, p.categoria_id, p.nome, p.descricao, p.preco, p.foto_url, p.disponivel, p.pede_ponto_carne,
            p.controla_estoque, p.estoque, p.estoque_minimo
     FROM produtos p
     JOIN categorias c ON c.id = p.categoria_id
     WHERE c.estabelecimento_id = $1
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
     WHERE c.estabelecimento_id = $1
     ORDER BY r.produto_id, r.ingrediente`,
    [eid]
  );

  return categorias.map((cat) => ({
    id: cat.id,
    nome: cat.nome,
    ordem: cat.ordem,
    produtos: produtos
      .filter((p) => p.categoria_id === cat.id)
      .map((p) => ({
        ...mapProdutoRow(p),
        adicionais: adicionais
          .filter((a) => a.produto_id === p.id)
          .map((a) => ({ id: a.id, nome: a.nome, preco: Number(a.preco) })),
        removiveis: removiveis
          .filter((r) => r.produto_id === p.id)
          .map((r) => r.ingrediente),
      })),
  }));
}

async function criarCategoria({ nome, ordem = 0 }, estabelecimentoId) {
  const n = String(nome || '').trim();
  if (!n) throw new ErroAdmin(400, 'Nome da categoria é obrigatório');
  const eid = await resolveEstabelecimentoId(estabelecimentoId);
  const { rows } = await pool.query(
    'INSERT INTO categorias (nome, ordem, estabelecimento_id) VALUES ($1, $2, $3) RETURNING id, nome, ordem',
    [n, Number(ordem) || 0, eid]
  );
  return rows[0];
}

async function atualizarCategoria(id, { nome, ordem }, estabelecimentoId) {
  await assertPertenceAoTenant(pool, 'categorias', id, estabelecimentoId);
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

async function criarProduto(body, estabelecimentoId) {
  const nome = String(body.nome || '').trim();
  const categoriaId = Number(body.categoriaId);
  const preco = Number(body.preco);
  if (!nome) throw new ErroAdmin(400, 'Nome do produto é obrigatório');
  if (!categoriaId) throw new ErroAdmin(400, 'categoriaId é obrigatório');
  if (Number.isNaN(preco) || preco < 0) throw new ErroAdmin(400, 'Preço inválido');
  await assertPertenceAoTenant(pool, 'categorias', categoriaId, estabelecimentoId);

  const { rows } = await pool.query(
    `INSERT INTO produtos (categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne, controla_estoque, estoque, estoque_minimo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne, controla_estoque, estoque, estoque_minimo`,
    [
      categoriaId,
      nome,
      body.descricao ? String(body.descricao).trim() : null,
      preco,
      normalizeFotoUrl(body.fotoUrl ?? null),
      body.disponivel !== false,
      Boolean(body.pedePontoCarne),
      Boolean(body.controlaEstoque || body.controla_estoque),
      body.estoque != null && body.estoque !== '' ? Number(body.estoque) : null,
      Number(body.estoqueMinimo ?? body.estoque_minimo ?? 0) || 0,
    ]
  );
  return { ...mapProdutoRow(rows[0]), adicionais: [], removiveis: [] };
}

async function atualizarProduto(id, body, estabelecimentoId) {
  await assertPertenceAoTenant(pool, 'produtos', id, estabelecimentoId);
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
    vals.push(normalizeFotoUrl(body.fotoUrl));
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
    const novaCategoriaId = Number(body.categoriaId);
    // sem isso, dava pra "migrar" um produto pra categoria de outro tenant
    await assertPertenceAoTenant(pool, 'categorias', novaCategoriaId, estabelecimentoId);
    campos.push(`categoria_id = $${i++}`);
    vals.push(novaCategoriaId);
  }
  if (body.controlaEstoque !== undefined || body.controla_estoque !== undefined) {
    campos.push(`controla_estoque = $${i++}`);
    vals.push(Boolean(body.controlaEstoque ?? body.controla_estoque));
  }
  if (body.estoque !== undefined) {
    campos.push(`estoque = $${i++}`);
    vals.push(body.estoque === null || body.estoque === '' ? null : Number(body.estoque));
  }
  if (body.estoqueMinimo !== undefined || body.estoque_minimo !== undefined) {
    campos.push(`estoque_minimo = $${i++}`);
    vals.push(Number(body.estoqueMinimo ?? body.estoque_minimo ?? 0) || 0);
  }
  if (!campos.length) throw new ErroAdmin(400, 'Nada para atualizar');

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE produtos SET ${campos.join(', ')} WHERE id = $${i}
     RETURNING id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne, controla_estoque, estoque, estoque_minimo`,
    vals
  );
  if (!rows[0]) throw new ErroAdmin(404, 'Produto não encontrado');
  return mapProdutoRow(rows[0]);
}

async function criarAdicional(produtoId, { nome, preco }, estabelecimentoId) {
  const n = String(nome || '').trim();
  const p = Number(preco);
  if (!n) throw new ErroAdmin(400, 'Nome do adicional é obrigatório');
  if (Number.isNaN(p) || p < 0) throw new ErroAdmin(400, 'Preço inválido');

  await assertPertenceAoTenant(pool, 'produtos', produtoId, estabelecimentoId);

  const { rows } = await pool.query(
    'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1, $2, $3) RETURNING id, produto_id, nome, preco',
    [produtoId, n, p]
  );
  return { id: rows[0].id, produtoId: rows[0].produto_id, nome: rows[0].nome, preco: Number(rows[0].preco) };
}

async function removerAdicional(id, estabelecimentoId) {
  await assertPertenceAoTenant(pool, 'adicionais', id, estabelecimentoId);
  const { rowCount } = await pool.query('DELETE FROM adicionais WHERE id = $1', [id]);
  if (!rowCount) throw new ErroAdmin(404, 'Adicional não encontrado');
  return { ok: true };
}

async function setRemoviveis(produtoId, ingredientes, estabelecimentoId) {
  const lista = Array.isArray(ingredientes)
    ? [...new Set(ingredientes.map((x) => String(x).trim()).filter(Boolean))]
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertPertenceAoTenant(client, 'produtos', produtoId, estabelecimentoId);

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


async function removerProduto(id, estabelecimentoId) {
  await assertPertenceAoTenant(pool, 'produtos', id, estabelecimentoId);
  const { rows: used } = await pool.query(
    'SELECT 1 FROM itens_pedido WHERE produto_id = $1 LIMIT 1',
    [id]
  );
  if (used[0]) {
    throw new ErroAdmin(
      409,
      'Produto já aparece em pedidos antigos e não pode ser excluído. Use Pausar ou Esgotar.'
    );
  }
  const { rows: usedAdd } = await pool.query(
    `SELECT 1 FROM itens_pedido_adicionais ia
     JOIN adicionais a ON a.id = ia.adicional_id
     WHERE a.produto_id = $1 LIMIT 1`,
    [id]
  );
  if (usedAdd[0]) {
    throw new ErroAdmin(
      409,
      'Opções deste produto já foram usadas em pedidos e não podem ser excluídas. Use Pausar.'
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM produtos_ingredientes_removiveis WHERE produto_id = $1', [id]);
    await client.query('DELETE FROM adicionais WHERE produto_id = $1', [id]);
    const { rowCount } = await client.query('DELETE FROM produtos WHERE id = $1', [id]);
    if (!rowCount) throw new ErroAdmin(404, 'Produto não encontrado');
    await client.query('COMMIT');
    return { ok: true };
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
  removerProduto,
};
