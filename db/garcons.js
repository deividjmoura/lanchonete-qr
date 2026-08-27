const pool = require('./pool');

class ErroGarcom extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function listGarcons() {
  const { rows } = await pool.query(
    `SELECT g.id, g.nome, g.token, g.ativo, g.criado_em,
            (SELECT COUNT(*)::int FROM pedidos p WHERE p.garcom_id = g.id) AS entregas
     FROM garcons g
     ORDER BY g.nome`
  );
  return rows;
}

async function criarGarcom({ nome }) {
  const n = String(nome || '').trim().slice(0, 80);
  if (!n) throw new ErroGarcom(400, 'Informe o nome');
  const { rows } = await pool.query(
    `INSERT INTO garcons (nome)
     VALUES ($1)
     RETURNING id, nome, token, ativo, criado_em`,
    [n]
  );
  return rows[0];
}

async function setGarcomAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE garcons SET ativo = $2 WHERE id = $1
     RETURNING id, nome, token, ativo, criado_em`,
    [id, !!ativo]
  );
  if (!rows[0]) throw new ErroGarcom(404, 'Garçom não encontrado');
  return rows[0];
}

async function removerGarcom(id) {
  const { rowCount } = await pool.query('DELETE FROM garcons WHERE id = $1', [id]);
  if (!rowCount) throw new ErroGarcom(404, 'Garçom não encontrado');
  return { ok: true };
}

async function getGarcomPorToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT id, nome, token, ativo FROM garcons WHERE token = $1`,
    [token]
  );
  return rows[0] || null;
}

async function entregarComoGarcom(token, pedidoId) {
  const garcom = await getGarcomPorToken(token);
  if (!garcom || !garcom.ativo) throw new ErroGarcom(401, 'Link inválido ou garçom desativado');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, sessao_id, claimed_at, garcom_id
       FROM pedidos WHERE id = $1 FOR UPDATE`,
      [pedidoId]
    );
    const pedido = rows[0];
    if (!pedido) throw new ErroGarcom(404, 'Pedido não encontrado');
    if (pedido.status !== 'concluido') {
      throw new ErroGarcom(409, `Pedido está em '${pedido.status}', só dá para entregar o que está pronto`);
    }
    if (pedido.garcom_id && pedido.garcom_id !== garcom.id) {
      throw new ErroGarcom(409, 'Pedido já foi pego por outro garçom');
    }

    await client.query(
      `UPDATE pedidos
       SET status = 'entregue', garcom_id = $2, garcom_nome = $3, claimed_at = COALESCE(claimed_at, NOW())
       WHERE id = $1`,
      [pedidoId, garcom.id, garcom.nome]
    );

    const { rows: totalRows } = await client.query(
      `SELECT COALESCE(SUM(
         ip.quantidade * (ip.preco_unitario + COALESCE(ad.total_adicionais, 0))
       ), 0) AS total
       FROM itens_pedido ip
       LEFT JOIN (
         SELECT item_pedido_id, SUM(preco_unitario) AS total_adicionais
         FROM itens_pedido_adicionais
         GROUP BY item_pedido_id
       ) ad ON ad.item_pedido_id = ip.id
       WHERE ip.pedido_id = $1`,
      [pedidoId]
    );
    await client.query(
      'UPDATE mesa_sessoes SET valor_total = valor_total + $1 WHERE id = $2',
      [Number(totalRows[0].total), pedido.sessao_id]
    );

    await client.query('COMMIT');
    return {
      id: pedidoId,
      status: 'entregue',
      garcom: { id: garcom.id, nome: garcom.nome },
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Painel admin: pedidos com filtros.
 * - ativos=true → só recebido / em_producao / concluido (não polui com histórico)
 * - from / to (YYYY-MM-DD) → histórico por período
 * 3 queries em lote (sem N+1).
 */
async function listPedidosRecentes({ limit = 50, ativos = false, from = null, to = null } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const where = [];
  const params = [];
  let idx = 1;

  if (ativos) {
    where.push(`p.status = ANY($${idx}::text[])`);
    params.push(['recebido', 'em_producao', 'concluido']);
    idx += 1;
  }
  if (from) {
    where.push(`p.criado_em >= $${idx}::date`);
    params.push(from);
    idx += 1;
  }
  if (to) {
    // inclusive até o fim do dia
    where.push(`p.criado_em < ($${idx}::date + interval '1 day')`);
    params.push(to);
    idx += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(lim);

  const { rows: pedidos } = await pool.query(
    `SELECT p.id, p.status, p.criado_em, p.cliente_nome, p.garcom_nome, p.claimed_at,
            p.observacao_geral,
            m.numero AS mesa
     FROM pedidos p
     JOIN mesa_sessoes s ON s.id = p.sessao_id
     JOIN mesas m ON m.id = s.mesa_id
     ${whereSql}
     ORDER BY p.criado_em DESC
     LIMIT $${idx}`,
    params
  );
  if (!pedidos.length) return [];

  const ids = pedidos.map((p) => p.id);
  const { rows: itensRows } = await pool.query(
    `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = ANY($1::int[])
     ORDER BY ip.id`,
    [ids]
  );

  const itemIds = itensRows.map((i) => i.id);
  let adicionaisRows = [];
  let remocoesRows = [];
  if (itemIds.length) {
    const [adRes, remRes] = await Promise.all([
      pool.query(
        `SELECT ipa.item_pedido_id, a.nome, ipa.preco_unitario
         FROM itens_pedido_adicionais ipa
         JOIN adicionais a ON a.id = ipa.adicional_id
         WHERE ipa.item_pedido_id = ANY($1::int[])`,
        [itemIds]
      ),
      pool.query(
        `SELECT item_pedido_id, ingrediente
         FROM itens_pedido_remocoes
         WHERE item_pedido_id = ANY($1::int[])`,
        [itemIds]
      ),
    ]);
    adicionaisRows = adRes.rows;
    remocoesRows = remRes.rows;
  }

  const addByItem = new Map();
  for (const a of adicionaisRows) {
    if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
    addByItem.get(a.item_pedido_id).push({ nome: a.nome, preco: Number(a.preco_unitario) });
  }
  const remByItem = new Map();
  for (const r of remocoesRows) {
    if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
    remByItem.get(r.item_pedido_id).push(r.ingrediente);
  }

  const itensByPedido = new Map();
  for (const item of itensRows) {
    const adicionais = addByItem.get(item.id) || [];
    const remocoes = remByItem.get(item.id) || [];
    const totalAdicionais = adicionais.reduce((s, a) => s + a.preco, 0);
    const linha = (Number(item.preco_unitario) + totalAdicionais) * item.quantidade;
    const packed = {
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      ponto_carne: item.ponto_carne,
      observacao: item.observacao,
      adicionais,
      remocoes,
      totalLinha: Number(linha.toFixed(2)),
    };
    if (!itensByPedido.has(item.pedido_id)) itensByPedido.set(item.pedido_id, []);
    itensByPedido.get(item.pedido_id).push(packed);
  }

  return pedidos.map((p) => {
    const itens = itensByPedido.get(p.id) || [];
    const totalPedido = itens.reduce((s, i) => s + i.totalLinha, 0);
    return {
      ...p,
      itens,
      totalPedido: Number(totalPedido.toFixed(2)),
    };
  });
}

module.exports = {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  entregarComoGarcom,
  listPedidosRecentes,
};
