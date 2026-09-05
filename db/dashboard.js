// Resumo do dia para o admin (faturamento, ticket, top produtos).
const pool = require('./pool');
const { resolveEstabelecimentoId } = require('./tenant');

/**
 * @param {{ from?: string|null, to?: string|null }} [opts]
 * from/to em YYYY-MM-DD (opcional). Default: hoje (timezone do servidor / DB).
 */
async function resumoDia(opts = {}) {
  const eid = await resolveEstabelecimentoId(opts.estabelecimentoId);
  const from = opts.from || null;
  const to = opts.to || null;

  const rangeSql = from && to
    ? { start: from, end: to }
    : null;

  const sessoesQ = rangeSql
    ? await pool.query(
        `SELECT s.id, s.valor_total, s.desconto, s.taxa_servico, s.valor_cobrado, s.forma_pagamento, s.fechada_em, s.aberta_em
         FROM mesa_sessoes s
         JOIN mesas m ON m.id = s.mesa_id
         WHERE s.status = 'fechada'
           AND m.estabelecimento_id = $1
           AND s.fechada_em::date >= $2::date
           AND s.fechada_em::date <= $3::date`,
        [eid, rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT s.id, s.valor_total, s.desconto, s.taxa_servico, s.valor_cobrado, s.forma_pagamento, s.fechada_em, s.aberta_em
         FROM mesa_sessoes s
         JOIN mesas m ON m.id = s.mesa_id
         WHERE s.status = 'fechada'
           AND m.estabelecimento_id = $1
           AND s.fechada_em::date = CURRENT_DATE`,
        [eid]
      );

  const sessoes = sessoesQ.rows;
  const valorSessao = (r) =>
    r.valor_cobrado != null && r.valor_cobrado !== ''
      ? Number(r.valor_cobrado)
      : Number(r.valor_total || 0);
  const faturamento = sessoes.reduce((s, r) => s + valorSessao(r), 0);
  const contasFechadas = sessoes.length;
  const ticketMedio = contasFechadas ? faturamento / contasFechadas : 0;

  const porForma = {};
  for (const s of sessoes) {
    const k = s.forma_pagamento || 'outro';
    porForma[k] = (porForma[k] || 0) + valorSessao(s);
  }

  const pedidosQ = rangeSql
    ? await pool.query(
        `SELECT p.status, COUNT(*)::int AS n
         FROM pedidos p
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         JOIN mesas m ON m.id = s.mesa_id
         WHERE m.estabelecimento_id = $1
           AND p.criado_em::date >= $2::date AND p.criado_em::date <= $3::date
         GROUP BY p.status`,
        [eid, rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT p.status, COUNT(*)::int AS n
         FROM pedidos p
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         JOIN mesas m ON m.id = s.mesa_id
         WHERE m.estabelecimento_id = $1
           AND p.criado_em::date = CURRENT_DATE
         GROUP BY p.status`,
        [eid]
      );

  const pedidosPorStatus = {
    recebido: 0,
    em_producao: 0,
    concluido: 0,
    entregue: 0,
  };
  let pedidosTotal = 0;
  for (const r of pedidosQ.rows) {
    pedidosPorStatus[r.status] = r.n;
    pedidosTotal += r.n;
  }

  const { rows: mesaRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM mesas WHERE estabelecimento_id = $1 GROUP BY status`,
    [eid]
  );
  const mesas = { livre: 0, ocupada: 0 };
  for (const r of mesaRows) mesas[r.status] = r.n;

  const { rows: abertas } = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(s.valor_total), 0)::float AS total
     FROM mesa_sessoes s
     JOIN mesas m ON m.id = s.mesa_id
     WHERE s.status = 'aberta' AND m.estabelecimento_id = $1`,
    [eid]
  );
  const emAberto = {
    sessoes: abertas[0].n,
    valorEntregue: Number(abertas[0].total || 0),
  };

  const topQ = rangeSql
    ? await pool.query(
        `SELECT pr.nome,
                SUM(ip.quantidade)::int AS qtd,
                SUM(
                  ip.quantidade * (
                    ip.preco_unitario + COALESCE(ad.total_ad, 0)
                  )
                )::float AS receita
         FROM itens_pedido ip
         JOIN produtos pr ON pr.id = ip.produto_id
         JOIN pedidos p ON p.id = ip.pedido_id
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         JOIN mesas m ON m.id = s.mesa_id
         LEFT JOIN (
           SELECT item_pedido_id, SUM(preco_unitario) AS total_ad
           FROM itens_pedido_adicionais
           GROUP BY item_pedido_id
         ) ad ON ad.item_pedido_id = ip.id
         WHERE m.estabelecimento_id = $1
           AND p.criado_em::date >= $2::date AND p.criado_em::date <= $3::date
         GROUP BY pr.nome
         ORDER BY qtd DESC
         LIMIT 8`,
        [eid, rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT pr.nome,
                SUM(ip.quantidade)::int AS qtd,
                SUM(
                  ip.quantidade * (
                    ip.preco_unitario + COALESCE(ad.total_ad, 0)
                  )
                )::float AS receita
         FROM itens_pedido ip
         JOIN produtos pr ON pr.id = ip.produto_id
         JOIN pedidos p ON p.id = ip.pedido_id
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         JOIN mesas m ON m.id = s.mesa_id
         LEFT JOIN (
           SELECT item_pedido_id, SUM(preco_unitario) AS total_ad
           FROM itens_pedido_adicionais
           GROUP BY item_pedido_id
         ) ad ON ad.item_pedido_id = ip.id
         WHERE m.estabelecimento_id = $1
           AND p.criado_em::date = CURRENT_DATE
         GROUP BY pr.nome
         ORDER BY qtd DESC
         LIMIT 8`,
        [eid]
      );

  const topProdutos = topQ.rows.map((r) => ({
    nome: r.nome,
    quantidade: r.qtd,
    receita: Number(Number(r.receita || 0).toFixed(2)),
  }));

  return {
    periodo: rangeSql
      ? { from: rangeSql.start, to: rangeSql.end }
      : { from: null, to: null, label: 'hoje' },
    faturamento: Number(faturamento.toFixed(2)),
    contasFechadas,
    ticketMedio: Number(ticketMedio.toFixed(2)),
    porFormaPagamento: porForma,
    pedidosTotal,
    pedidosPorStatus,
    mesas,
    emAberto,
    topProdutos,
  };
}


/** Top produtos do dia (público — só id, nome, qtd). */
async function topProdutosHoje(limit = 6, estabelecimentoId = null) {
  const eid = await resolveEstabelecimentoId(estabelecimentoId);
  const lim = Math.min(12, Math.max(1, Number(limit) || 6));
  const { rows } = await pool.query(
    `SELECT pr.id,
            pr.nome,
            pr.descricao,
            pr.preco,
            pr.foto_url AS "fotoUrl",
            SUM(ip.quantidade)::int AS quantidade
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     JOIN pedidos p ON p.id = ip.pedido_id
     JOIN mesa_sessoes s ON s.id = p.sessao_id
     JOIN mesas m ON m.id = s.mesa_id
     WHERE m.estabelecimento_id = $1
       AND p.criado_em::date = CURRENT_DATE
       AND p.status <> 'cancelado'
     GROUP BY pr.id, pr.nome, pr.descricao, pr.preco, pr.foto_url
     ORDER BY quantidade DESC, pr.nome ASC
     LIMIT $2`,
    [eid, lim]
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    descricao: r.descricao || '',
    preco: Number(r.preco || 0),
    fotoUrl: r.fotoUrl || null,
    quantidade: r.quantidade,
  }));
}

module.exports = { resumoDia, topProdutosHoje };

