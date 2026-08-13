// Caixa: listar sessões abertas e fechar conta (forma de pagamento).
// valor_total em mesa_sessoes só conta pedidos já "entregue" — ver plano §1.
const pool = require('./pool');

const FORMAS = new Set(['dinheiro', 'pix', 'cartao_debito', 'cartao_credito']);

class ErroCaixa extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Monta itens com extras e subtotal a partir de rows já buscadas em lote. */
function montarItensComExtras(itensRows, addByItem, remByItem) {
  return itensRows.map((item) => {
    const adicionais = addByItem.get(item.id) || [];
    const remocoes = remByItem.get(item.id) || [];
    const totalAdicionais = adicionais.reduce((s, a) => s + a.preco, 0);
    const precoUnitario = Number(item.preco_unitario);
    return {
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      ponto_carne: item.ponto_carne,
      observacao: item.observacao,
      adicionais,
      remocoes,
      precoUnitario,
      subtotal: Number(((precoUnitario + totalAdicionais) * item.quantidade).toFixed(2)),
    };
  });
}

async function listSessoesAbertas() {
  const { rows: sessoes } = await pool.query(
    `SELECT s.id, s.aberta_em, s.valor_total, m.id AS mesa_id, m.numero AS mesa
     FROM mesa_sessoes s
     JOIN mesas m ON m.id = s.mesa_id
     WHERE s.status = 'aberta'
     ORDER BY m.numero`
  );
  if (!sessoes.length) return [];

  const sessaoIds = sessoes.map((s) => s.id);
  const { rows: pedidos } = await pool.query(
    `SELECT id, sessao_id, status, criado_em, observacao_geral
     FROM pedidos
     WHERE sessao_id = ANY($1::int[])
     ORDER BY criado_em`,
    [sessaoIds]
  );

  const entregueIds = pedidos.filter((p) => p.status === 'entregue').map((p) => p.id);
  let itensRows = [];
  const addByItem = new Map();
  const remByItem = new Map();

  if (entregueIds.length) {
    const itensRes = await pool.query(
      `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao
       FROM itens_pedido ip
       JOIN produtos pr ON pr.id = ip.produto_id
       WHERE ip.pedido_id = ANY($1::int[])
       ORDER BY ip.id`,
      [entregueIds]
    );
    itensRows = itensRes.rows;
    const itemIds = itensRows.map((i) => i.id);
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
      for (const a of adRes.rows) {
        if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
        addByItem.get(a.item_pedido_id).push({ nome: a.nome, preco: Number(a.preco_unitario) });
      }
      for (const r of remRes.rows) {
        if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
        remByItem.get(r.item_pedido_id).push(r.ingrediente);
      }
    }
  }

  const itensByPedido = new Map();
  for (const item of itensRows) {
    if (!itensByPedido.has(item.pedido_id)) itensByPedido.set(item.pedido_id, []);
    itensByPedido.get(item.pedido_id).push(item);
  }

  const pedidosBySessao = new Map();
  for (const p of pedidos) {
    if (!pedidosBySessao.has(p.sessao_id)) pedidosBySessao.set(p.sessao_id, []);
    pedidosBySessao.get(p.sessao_id).push(p);
  }

  return sessoes.map((s) => {
    const lista = pedidosBySessao.get(s.id) || [];
    const entregues = [];
    let pendentes = 0;
    for (const p of lista) {
      if (p.status === 'entregue') {
        const raw = itensByPedido.get(p.id) || [];
        const itens = montarItensComExtras(raw, addByItem, remByItem);
        const totalPedido = Number(itens.reduce((acc, i) => acc + i.subtotal, 0).toFixed(2));
        entregues.push({
          id: p.id,
          criadoEm: p.criado_em,
          observacaoGeral: p.observacao_geral,
          itens,
          total: totalPedido,
        });
      } else {
        pendentes += 1;
      }
    }
    return {
      id: s.id,
      mesa: s.mesa,
      mesaId: s.mesa_id,
      abertaEm: s.aberta_em,
      valorTotal: Number(s.valor_total),
      pedidosEntregues: entregues,
      pedidosPendentes: pendentes,
      podeFechar: pendentes === 0,
    };
  });
}

// Fecha a sessão: grava forma de pagamento, libera a mesa.
// Bloqueia se ainda houver pedidos não entregues (cozinha/garçom).
async function fecharSessao(sessaoId, body) {
  const forma = String(body.formaPagamento || body.forma_pagamento || '')
    .trim()
    .toLowerCase();
  if (!FORMAS.has(forma)) {
    throw new ErroCaixa(
      400,
      'Forma de pagamento inválida. Use: dinheiro, pix, cartao_debito ou cartao_credito'
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT s.id, s.status, s.valor_total, s.mesa_id, m.numero AS mesa
       FROM mesa_sessoes s
       JOIN mesas m ON m.id = s.mesa_id
       WHERE s.id = $1
       FOR UPDATE`,
      [sessaoId]
    );
    const sessao = rows[0];
    if (!sessao) throw new ErroCaixa(404, 'Sessão não encontrada');
    if (sessao.status !== 'aberta') {
      throw new ErroCaixa(409, 'Sessão já está fechada');
    }

    const { rows: pendentes } = await client.query(
      `SELECT COUNT(*)::int AS n FROM pedidos
       WHERE sessao_id = $1 AND status <> 'entregue'`,
      [sessaoId]
    );
    if (pendentes[0].n > 0) {
      throw new ErroCaixa(
        409,
        `Ainda há ${pendentes[0].n} pedido(s) em andamento. Aguarde a entrega antes de fechar.`
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE mesa_sessoes
       SET status = 'fechada',
           fechada_em = now(),
           forma_pagamento = $1
       WHERE id = $2
       RETURNING id, valor_total, forma_pagamento, fechada_em, aberta_em`,
      [forma, sessaoId]
    );

    await client.query("UPDATE mesas SET status = 'livre' WHERE id = $1", [sessao.mesa_id]);

    await client.query('COMMIT');

    const row = updated[0];
    return {
      id: row.id,
      mesa: sessao.mesa,
      valorTotal: Number(row.valor_total),
      formaPagamento: row.forma_pagamento,
      abertaEm: row.aberta_em,
      fechadaEm: row.fechada_em,
      status: 'fechada',
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* sem transação */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listSessoesAbertas, fecharSessao, ErroCaixa, FORMAS };
