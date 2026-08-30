// Cliente informa pagamento PIX (não fecha a sessão).
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
    const { rows: mesas } = await client.query(
      'SELECT id, numero FROM mesas WHERE token = $1',
      [token]
    );
    if (!mesas.length) {
      throw new ErroPixCliente(404, 'Mesa não encontrada');
    }
    const mesa = mesas[0];
    const { rows } = await client.query(
      `UPDATE mesa_sessoes
       SET pix_informado_em = now()
       WHERE mesa_id = $1 AND status = 'aberta'
       RETURNING id, pix_informado_em`,
      [mesa.id]
    );
    if (!rows.length) {
      throw new ErroPixCliente(400, 'Nenhuma conta aberta nesta mesa');
    }
    return {
      ok: true,
      mesa: mesa.numero,
      sessaoId: rows[0].id,
      pixInformadoEm: rows[0].pix_informado_em,
    };
  } finally {
    client.release();
  }
}

module.exports = { informarPixPago, ErroPixCliente };
