// Cliente informa pagamento PIX: avisa o caixa (sem baixar o valor automaticamente).
// O registro do valor parcial fica a cargo do caixa (divisão de conta).
const pool = require('./pool');

class ErroPixCliente extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function informarPixPago(token) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: mesas } = await client.query(
      'SELECT id, numero FROM mesas WHERE token = $1',
      [token]
    );
    if (!mesas.length) {
      throw new ErroPixCliente(404, 'Mesa não encontrada');
    }
    const mesa = mesas[0];

    const { rows: sessaoRows } = await client.query(
      `SELECT id, valor_total, pix_informado_em
       FROM mesa_sessoes
       WHERE mesa_id = $1 AND status = 'aberta'
       FOR UPDATE`,
      [mesa.id]
    );
    if (!sessaoRows.length) {
      throw new ErroPixCliente(400, 'Nenhuma conta aberta nesta mesa');
    }
    const sessao = sessaoRows[0];
    const sessaoId = sessao.id;
    const valorTotal = Number(sessao.valor_total || 0);

    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(valor), 0)::float AS pago
       FROM sessao_pagamentos WHERE sessao_id = $1`,
      [sessaoId]
    );
    const valorPago = Number(sumRows[0].pago || 0);
    const valorRestante = Number(Math.max(0, valorTotal - valorPago).toFixed(2));

    if (valorRestante <= 0.009) {
      throw new ErroPixCliente(
        400,
        'Nada a pagar no momento — a conta já está quitada ou ainda não há pedidos entregues.'
      );
    }

    // Só avisa o caixa. Não grava pagamento aqui:
    // cada pagante pode avisar; o caixa confirma o valor na divisão.
    const { rows: updated } = await client.query(
      `UPDATE mesa_sessoes
       SET pix_informado_em = now()
       WHERE id = $1
       RETURNING id, pix_informado_em`,
      [sessaoId]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      mesa: mesa.numero,
      sessaoId,
      pixInformadoEm: updated[0].pix_informado_em,
      valorTotal,
      valorPago,
      valorRestante,
      pagamento: null,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { informarPixPago, ErroPixCliente };
