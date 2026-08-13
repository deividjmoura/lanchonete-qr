// Criação de pedido, avanço de status e leitura de sessão/fila da cozinha —
// tudo lendo/gravando Postgres. Ver plano, seção 2 (máquina de estados) e
// seção 6 (nunca confiar em preço/regra vinda do cliente).
const pool = require('./pool');
const { TRANSICOES, getMesaPorToken, getOuAbrirSessao, getProdutoComRegras } = require('./queries');

class ErroPedido extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Cria um pedido pra mesa identificada pelo token. Abre a sessão da mesa se
// for o primeiro pedido da visita, ou usa a sessão aberta existente.
// Cada item é revalidado contra o banco: preço, disponibilidade, adicionais
// e remoções permitidas, e se o produto pede ponto da carne.
async function criarPedido(token, body) {
  const itensInput = Array.isArray(body.items) ? body.items : [];
  if (!itensInput.length) throw new ErroPedido(400, 'O pedido está vazio');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');

    const sessaoId = await getOuAbrirSessao(client, mesa.id);

    const clienteNome = String(body.clienteNome || body.cliente_nome || '')
      .trim()
      .slice(0, 80) || null;
    if (clienteNome) {
      await client.query(
        `UPDATE mesa_sessoes SET cliente_nome = COALESCE(cliente_nome, $2) WHERE id = $1`,
        [sessaoId, clienteNome]
      );
    }

    const observacaoGeral = String(body.note || '').trim().slice(0, 500) || null;
    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos (sessao_id, observacao_geral, cliente_nome)
       VALUES ($1, $2, $3) RETURNING id, status, criado_em, cliente_nome`,
      [sessaoId, observacaoGeral, clienteNome]
    );
    const pedido = pedidoRows[0];

    const itensGravados = [];
    let total = 0;

    for (const item of itensInput) {
      const produtoId = Number(item.productId ?? item.id);
      const produto = await getProdutoComRegras(client, produtoId);
      // Produto inexistente/indisponível: ignora o item silenciosamente,
      // mesmo comportamento do server.js antigo com o menu em JSON.
      if (!produto || !produto.disponivel) continue;

      const quantidade = Math.max(1, Math.min(99, Number(item.qty) || 1));

      const adicionaisSelecionados = Array.isArray(item.additions) ? item.additions : [];
      const adicionaisValidos = [];
      for (const a of adicionaisSelecionados) {
        const permitido = produto.adicionaisPermitidos.find((x) => x.id === Number(a.id));
        if (permitido) adicionaisValidos.push(permitido);
      }

      const remocoesSolicitadas = Array.isArray(item.removals) ? item.removals : [];
      const remocoesValidas = [
        ...new Set(remocoesSolicitadas.filter((r) => produto.removiveisPermitidos.includes(r))),
      ];

      const pontoCarne =
        produto.pede_ponto_carne && ['MAL_PASSADO', 'AO_PONTO', 'BEM_PASSADO'].includes(item.meatPoint)
          ? item.meatPoint
          : null;

      const observacao = String(item.note || '').trim().slice(0, 300) || null;

      const { rows: itemRows } = await client.query(
        `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, ponto_carne, observacao)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [pedido.id, produto.id, quantidade, produto.preco, pontoCarne, observacao]
      );
      const itemId = itemRows[0].id;

      for (const a of adicionaisValidos) {
        await client.query(
          `INSERT INTO itens_pedido_adicionais (item_pedido_id, adicional_id, preco_unitario)
           VALUES ($1, $2, $3)`,
          [itemId, a.id, a.preco]
        );
      }
      for (const ingrediente of remocoesValidas) {
        await client.query(
          `INSERT INTO itens_pedido_remocoes (item_pedido_id, ingrediente) VALUES ($1, $2)`,
          [itemId, ingrediente]
        );
      }

      const precoAdicionais = adicionaisValidos.reduce((s, a) => s + Number(a.preco), 0);
      const unitTotal = Number(produto.preco) + precoAdicionais;
      total += unitTotal * quantidade;

      itensGravados.push({
        id: itemId,
        produtoId: produto.id,
        nome: produto.nome,
        quantidade,
        precoUnitario: Number(produto.preco),
        adicionais: adicionaisValidos.map((a) => ({ id: a.id, nome: a.nome, preco: Number(a.preco) })),
        removals: remocoesValidas,
        pontoCarne,
        observacao,
        unitTotal: Number(unitTotal.toFixed(2)),
      });
    }

    if (!itensGravados.length) throw new ErroPedido(400, 'Nenhum item válido no pedido');

    await client.query('COMMIT');

    return {
      id: pedido.id,
      sessaoId,
      mesa: mesa.numero,
      status: pedido.status,
      criadoEm: pedido.criado_em,
      clienteNome: pedido.cliente_nome || clienteNome,
      observacaoGeral,
      itens: itensGravados,
      total: Number(total.toFixed(2)),
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* sem transação em aberto */ }
    throw err;
  } finally {
    client.release();
  }
}

// Avança o status do pedido em UM passo (recebido -> em_producao ->
// concluido -> entregue). Não deixa pular etapa. Ao chegar em "entregue",
// soma o valor do pedido em mesa_sessoes.valor_total (é o momento em que o
// plano define que o valor "entra na conta da mesa" — ver seção 1 do plano).
async function avancarStatus(pedidoId, novoStatus) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, status, sessao_id FROM pedidos WHERE id = $1 FOR UPDATE',
      [pedidoId]
    );
    const pedido = rows[0];
    if (!pedido) throw new ErroPedido(404, 'Pedido não encontrado');

    const proximoEsperado = TRANSICOES[pedido.status];
    if (!proximoEsperado || proximoEsperado !== novoStatus) {
      throw new ErroPedido(
        409,
        `Pedido está em '${pedido.status}', não pode ir direto para '${novoStatus}'`
      );
    }

    await client.query('UPDATE pedidos SET status = $1 WHERE id = $2', [novoStatus, pedidoId]);

    if (novoStatus === 'entregue') {
      const { rows: totalRows } = await client.query(
        `SELECT COALESCE(SUM(
           ip.quantidade * (ip.preco_unitario + COALESCE(ad.total_adicionais, 0))
         ), 0) AS total
         FROM itens_pedido ip
         LEFT JOIN (
           SELECT item_pedido_id, SUM(preco_unitario) AS total_adicionais
           FROM itens_pedido_adicionais GROUP BY item_pedido_id
         ) ad ON ad.item_pedido_id = ip.id
         WHERE ip.pedido_id = $1`,
        [pedidoId]
      );
      await client.query('UPDATE mesa_sessoes SET valor_total = valor_total + $1 WHERE id = $2', [
        Number(totalRows[0].total),
        pedido.sessao_id,
      ]);
    }

    await client.query('COMMIT');
    return { id: pedidoId, status: novoStatus };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* sem transação em aberto */ }
    throw err;
  } finally {
    client.release();
  }
}

// Status + pedidos + total devido da sessão aberta da mesa. totalDevido soma
// TODOS os pedidos da sessão (qualquer status) — é "quanto o cliente já
// pediu", diferente de mesa_sessoes.valor_total (que só conta o que foi
// confirmado "entregue", usado pelo caixa no passo 7 do plano).
async function getSessao(token) {
  const client = await pool.connect();
  try {
    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');

    const { rows: sessaoRows } = await client.query(
      "SELECT id, aberta_em, cliente_nome FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'",
      [mesa.id]
    );
    const sessao = sessaoRows[0];
    if (!sessao) return { mesa: mesa.numero, sessaoAberta: false, pedidos: [], totalDevido: 0, clienteNome: null };

    const { rows: pedidos } = await client.query(
      `SELECT id, status, criado_em, observacao_geral, cliente_nome, garcom_nome, claimed_at
       FROM pedidos
       WHERE sessao_id = $1 ORDER BY criado_em`,
      [sessao.id]
    );
    if (!pedidos.length) {
      return {
        mesa: mesa.numero,
        sessaoAberta: true,
        sessaoId: sessao.id,
        abertaEm: sessao.aberta_em,
        clienteNome: sessao.cliente_nome || null,
        pedidos: [],
        totalDevido: 0,
      };
    }

    const ids = pedidos.map((p) => p.id);
    const { rows: itensRows } = await client.query(
      `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao
       FROM itens_pedido ip
       JOIN produtos pr ON pr.id = ip.produto_id
       WHERE ip.pedido_id = ANY($1::int[])
       ORDER BY ip.id`,
      [ids]
    );

    const itemIds = itensRows.map((i) => i.id);
    let adRows = [];
    let remRows = [];
    if (itemIds.length) {
      const [adRes, remRes] = await Promise.all([
        client.query(
          `SELECT ipa.item_pedido_id, a.nome, ipa.preco_unitario
           FROM itens_pedido_adicionais ipa
           JOIN adicionais a ON a.id = ipa.adicional_id
           WHERE ipa.item_pedido_id = ANY($1::int[])`,
          [itemIds]
        ),
        client.query(
          `SELECT item_pedido_id, ingrediente
           FROM itens_pedido_remocoes
           WHERE item_pedido_id = ANY($1::int[])`,
          [itemIds]
        ),
      ]);
      adRows = adRes.rows;
      remRows = remRes.rows;
    }

    const addByItem = new Map();
    for (const a of adRows) {
      if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
      addByItem.get(a.item_pedido_id).push({ nome: a.nome, preco: Number(a.preco_unitario) });
    }
    const remByItem = new Map();
    for (const r of remRows) {
      if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
      remByItem.get(r.item_pedido_id).push(r.ingrediente);
    }

    const itensByPedido = new Map();
    for (const item of itensRows) {
      const adicionais = addByItem.get(item.id) || [];
      const remocoes = remByItem.get(item.id) || [];
      const totalAdicionais = adicionais.reduce((sum, a) => sum + a.preco, 0);
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

    let totalDevido = 0;
    const pedidosComItens = pedidos.map((p) => {
      const itens = itensByPedido.get(p.id) || [];
      const totalPedido = itens.reduce((sum, i) => sum + i.totalLinha, 0);
      totalDevido += totalPedido;
      return { ...p, itens, totalPedido: Number(totalPedido.toFixed(2)) };
    });

    return {
      mesa: mesa.numero,
      sessaoAberta: true,
      sessaoId: sessao.id,
      abertaEm: sessao.aberta_em,
      clienteNome: sessao.cliente_nome || null,
      pedidos: pedidosComItens,
      totalDevido: Number(totalDevido.toFixed(2)),
    };
  } finally {
    client.release();
  }
}

/** Anexa adicionais/remoções a uma lista de itens (1–2 queries em lote). */
async function anexarExtrasAosItens(itens) {
  if (!itens.length) return itens;
  const itemIds = itens.map((i) => i.id);
  const [adRes, remRes] = await Promise.all([
    pool.query(
      `SELECT ipa.item_pedido_id, a.nome
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
  const addByItem = new Map();
  for (const a of adRes.rows) {
    if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
    addByItem.get(a.item_pedido_id).push({ nome: a.nome });
  }
  const remByItem = new Map();
  for (const r of remRes.rows) {
    if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
    remByItem.get(r.item_pedido_id).push(r.ingrediente);
  }
  for (const item of itens) {
    item.adicionais = addByItem.get(item.id) || [];
    item.remocoes = remByItem.get(item.id) || [];
  }
  return itens;
}

async function carregarItensPedido(pedidoId) {
  const { rows: itens } = await pool.query(
    `SELECT ip.id, pr.nome, ip.quantidade, ip.ponto_carne, ip.observacao
     FROM itens_pedido ip JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = $1`,
    [pedidoId]
  );
  return anexarExtrasAosItens(itens);
}

async function listarPedidosPorStatus(statuses) {
  const { rows: pedidos } = await pool.query(
    `SELECT p.id, p.status, p.criado_em, p.observacao_geral, p.cliente_nome, p.garcom_nome,
            m.numero AS mesa
     FROM pedidos p
     JOIN mesa_sessoes s ON s.id = p.sessao_id
     JOIN mesas m ON m.id = s.mesa_id
     WHERE p.status = ANY($1::text[])
     ORDER BY p.criado_em`,
    [statuses]
  );
  if (!pedidos.length) return [];

  const ids = pedidos.map((p) => p.id);
  const { rows: itensRows } = await pool.query(
    `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.ponto_carne, ip.observacao
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = ANY($1::int[])
     ORDER BY ip.id`,
    [ids]
  );
  await anexarExtrasAosItens(itensRows);

  const byPedido = new Map();
  for (const item of itensRows) {
    if (!byPedido.has(item.pedido_id)) byPedido.set(item.pedido_id, []);
    byPedido.get(item.pedido_id).push(item);
  }
  return pedidos.map((p) => ({ ...p, itens: byPedido.get(p.id) || [] }));
}

// Fila da cozinha: pedidos recebido/em_producao, mais antigo primeiro.
async function getFilaCozinha() {
  return listarPedidosPorStatus(['recebido', 'em_producao']);
}

// Fila do garçom: pedidos concluídos pela cozinha, prontos para entregar.
// Ao marcar entregue via avancarStatus, o valor soma em mesa_sessoes.valor_total.
async function getFilaGarcom() {
  return listarPedidosPorStatus(['concluido']);
}


/** Check-in do cliente: abre sessão (se preciso) e grava o nome. */
async function checkinCliente(token, body) {
  const nome = String(body.clienteNome || body.cliente_nome || body.nome || '')
    .trim()
    .slice(0, 80);
  if (!nome) throw new ErroPedido(400, 'Informe um nome');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');
    const sessaoId = await getOuAbrirSessao(client, mesa.id);
    await client.query(
      `UPDATE mesa_sessoes SET cliente_nome = $2 WHERE id = $1`,
      [sessaoId, nome]
    );
    await client.query('COMMIT');
    return { ok: true, mesa: mesa.numero, sessaoId, clienteNome: nome };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  criarPedido,
  avancarStatus,
  getSessao,
  getFilaCozinha,
  getFilaGarcom,
  checkinCliente,
  ErroPedido,
};
