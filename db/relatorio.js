// Relatório de vendas por período (dados para PDF / impressão).
const pool = require('./pool');
const { resumoDia } = require('./dashboard');

/**
 * @param {{ from: string, to: string }} opts  YYYY-MM-DD obrigatórios
 */
async function relatorioVendas({ from, to }) {
  if (!from || !to) {
    const err = new Error('Informe from e to (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const err = new Error('Datas inválidas. Use YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  if (from > to) {
    const err = new Error('"De" não pode ser depois de "Até"');
    err.status = 400;
    throw err;
  }

  const resumo = await resumoDia({ from, to });

  const { rows: porDia } = await pool.query(
    `SELECT fechada_em::date AS dia,
            COUNT(*)::int AS contas,
            COALESCE(SUM(valor_total), 0)::float AS faturamento
     FROM mesa_sessoes
     WHERE status = 'fechada'
       AND fechada_em::date >= $1::date
       AND fechada_em::date <= $2::date
     GROUP BY fechada_em::date
     ORDER BY dia`,
    [from, to]
  );

  const { rows: sessoes } = await pool.query(
    `SELECT s.id, s.valor_total, s.forma_pagamento, s.fechada_em, s.cliente_nome,
            m.numero AS mesa
     FROM mesa_sessoes s
     JOIN mesas m ON m.id = s.mesa_id
     WHERE s.status = 'fechada'
       AND s.fechada_em::date >= $1::date
       AND s.fechada_em::date <= $2::date
     ORDER BY s.fechada_em DESC
     LIMIT 500`,
    [from, to]
  );

  return {
    geradoEm: new Date().toISOString(),
    periodo: { from, to },
    resumo: {
      faturamento: resumo.faturamento,
      contasFechadas: resumo.contasFechadas,
      ticketMedio: resumo.ticketMedio,
      porFormaPagamento: resumo.porFormaPagamento,
      pedidosTotal: resumo.pedidosTotal,
      pedidosPorStatus: resumo.pedidosPorStatus,
      topProdutos: resumo.topProdutos,
    },
    porDia: porDia.map((r) => ({
      dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia).slice(0, 10),
      contas: r.contas,
      faturamento: Number(Number(r.faturamento || 0).toFixed(2)),
    })),
    contas: sessoes.map((s) => ({
      id: s.id,
      mesa: s.mesa,
      cliente: s.cliente_nome || null,
      valor: Number(Number(s.valor_total || 0).toFixed(2)),
      forma: s.forma_pagamento || 'outro',
      fechadaEm: s.fechada_em,
    })),
  };
}

module.exports = { relatorioVendas };
