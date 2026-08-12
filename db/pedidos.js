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

    const observacaoGeral = String(body.note || '').trim().slice(0, 500) || null;
    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos (sessao_id, observacao_geral)
       VALUES ($1, $2) RETURNING id, status, criado_em`,
      [sessaoId, observacaoGeral]
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
      "SELECT id, aberta_em FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'",
      [mesa.id]
    );
    const sessao = sessaoRows[0];
    if (!sessao) return { mesa: mesa.numero, sessaoAberta: false, pedidos: [], totalDevido: 0 };

    const { rows: pedidos } = await client.query(
      `SELECT id, status, criado_em, observacao_geral FROM pedidos
       WHERE sessao_id = $1 ORDER BY criado_em`,
      [sessao.id]
    );

    let totalDevido = 0;
    const pedidosComItens = [];
    for (const p of pedidos) {
      const { rows: itens } = await client.query(
        `SELECT ip.id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao
         FROM itens_pedido ip JOIN produtos pr ON pr.id = ip.produto_id
         WHERE ip.pedido_id = $1`,
        [p.id]
      );
      let totalPedido = 0;
      for (const item of itens) {
        const { rows: adicionais } = await client.query(
          'SELECT preco_unitario FROM itens_pedido_adicionais WHERE item_pedido_id = $1',
          [item.id]
        );
        const totalAdicionais = adicionais.reduce((s, a) => s + Number(a.preco_unitario), 0);
        totalPedido += (Number(item.preco_unitario) + totalAdicionais) * item.quantidade;
      }
      totalDevido += totalPedido;
      pedidosComItens.push({ ...p, itens, totalPedido: Number(totalPedido.toFixed(2)) });
    }

    return {
      mesa: mesa.numero,
      sessaoAberta: true,
      sessaoId: sessao.id,
      abertaEm: sessao.aberta_em,
      pedidos: pedidosComItens,
      totalDevido: Number(totalDevido.toFixed(2)),
    };
  } finally {
    client.release();
  }
}

// Fila da cozinha: pedidos recebido/em_producao, mais antigo primeiro.
async function getFilaCozinha() {
  const { rows: pedidos } = await pool.query(
    `SELECT p.id, p.status, p.criado_em, p.observacao_geral, m.numero AS mesa
     FROM pedidos p
     JOIN mesa_sessoes s ON s.id = p.sessao_id
     JOIN mesas m ON m.id = s.mesa_id
     WHERE p.status IN ('recebido', 'em_producao')
     ORDER BY p.criado_em`
  );

  const resultado = [];
  for (const p of pedidos) {
    const { rows: itens } = await pool.query(
      `SELECT ip.id, pr.nome, ip.quantidade, ip.ponto_carne, ip.observacao
       FROM itens_pedido ip JOIN produtos pr ON pr.id = ip.produto_id
       WHERE ip.pedido_id = $1`,
      [p.id]
    );
    resultado.push({ ...p, itens });
  }
  return resultado;
}

module.exports = { criarPedido, avancarStatus, getSessao, getFilaCozinha, ErroPedido };
