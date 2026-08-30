// Gateway PagBank / PagSeguro — PIX dinâmico + webhook.
// Docs: https://developer.pagbank.com.br/reference/create-qrcode-order
const pool = require('./pool');

const API_BASE =
  process.env.PAGBANK_SANDBOX === '1' || process.env.PAGBANK_SANDBOX === 'true'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com';

class ErroPagBank extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function tokenDisponivel() {
  return Boolean(String(process.env.PAGBANK_TOKEN || '').trim());
}

function publicBaseUrl() {
  const u = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return u || null;
}

async function pagbankFetch(path, { method = 'GET', body } = {}) {
  const token = String(process.env.PAGBANK_TOKEN || '').trim();
  if (!token) throw new ErroPagBank(503, 'PAGBANK_TOKEN não configurado');

  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      (data && (data.error_messages || data.message || data.error)) ||
      `PagBank HTTP ${res.status}`;
    const detail = Array.isArray(msg)
      ? msg.map((m) => m.description || m.message || JSON.stringify(m)).join('; ')
      : String(msg);
    throw new ErroPagBank(res.status >= 400 && res.status < 600 ? res.status : 502, detail);
  }
  return data;
}

/**
 * Cria cobrança PIX dinâmica para o restante da sessão.
 * reference_id = sessao:{id}:{ts} para reconciliar no webhook.
 */
async function criarCobrancaPix(tokenMesa, opts = {}) {
  if (!tokenDisponivel()) {
    throw new ErroPagBank(503, 'Gateway PagBank desligado — use PIX estático ou configure PAGBANK_TOKEN');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: mesas } = await client.query(
      'SELECT id, numero FROM mesas WHERE token = $1',
      [tokenMesa]
    );
    if (!mesas.length) throw new ErroPagBank(404, 'Mesa não encontrada');
    const mesa = mesas[0];

    const { rows: sessaoRows } = await client.query(
      `SELECT id, valor_total, cliente_nome
       FROM mesa_sessoes
       WHERE mesa_id = $1 AND status = 'aberta'
       FOR UPDATE`,
      [mesa.id]
    );
    if (!sessaoRows.length) throw new ErroPagBank(400, 'Nenhuma conta aberta nesta mesa');
    const sessao = sessaoRows[0];

    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(valor), 0)::float AS pago
       FROM sessao_pagamentos WHERE sessao_id = $1`,
      [sessao.id]
    );
    const valorPago = Number(sumRows[0].pago || 0);
    const valorTotal = Number(sessao.valor_total || 0);
    let valorRestante = Number(Math.max(0, valorTotal - valorPago).toFixed(2));

    // Valor parcial opcional (divisão na mesa)
    if (opts.valor != null && opts.valor !== '') {
      const v = Number(String(opts.valor).replace(',', '.'));
      if (!Number.isFinite(v) || v <= 0) throw new ErroPagBank(400, 'Valor inválido');
      if (v > valorRestante + 0.009) {
        throw new ErroPagBank(400, `Valor maior que o restante (R$ ${valorRestante.toFixed(2)})`);
      }
      valorRestante = Number(v.toFixed(2));
    }

    if (valorRestante <= 0.009) {
      throw new ErroPagBank(400, 'Nada a pagar no momento');
    }

    const centavos = Math.round(valorRestante * 100);
    const referenceId = `sessao:${sessao.id}:${Date.now()}`;

    const exp = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    const expIso = exp.toISOString().replace(/\.\d{3}Z$/, '-03:00');

    const base = publicBaseUrl();
    const notificationUrls = base ? [`${base}/api/webhooks/pagbank`] : [];

    const customerName =
      String(opts.clienteNome || sessao.cliente_nome || 'Cliente Mesa ' + mesa.numero).slice(0, 120);
    // PagBank exige tax_id; use PAGBANK_DEFAULT_TAX_ID ou CPF informado
    const taxId = String(
      opts.taxId || process.env.PAGBANK_DEFAULT_TAX_ID || '00000000000'
    ).replace(/\D/g, '').slice(0, 14);

    const payload = {
      reference_id: referenceId,
      customer: {
        name: customerName,
        email: String(opts.email || process.env.PAGBANK_DEFAULT_EMAIL || 'cliente@lanchonete.local'),
        tax_id: taxId,
      },
      items: [
        {
          name: `Mesa ${mesa.numero} · conta`,
          quantity: 1,
          unit_amount: centavos,
        },
      ],
      qr_codes: [
        {
          amount: { value: centavos },
          expiration_date: expIso,
        },
      ],
    };
    if (notificationUrls.length) payload.notification_urls = notificationUrls;

    const order = await pagbankFetch('/orders', { method: 'POST', body: payload });

    const qr = (order.qr_codes || order.qr_code || [])[0] || {};
    const pngLink = (qr.links || []).find((l) => l.rel === 'QRCODE.PNG');

    const { rows: ins } = await client.query(
      `INSERT INTO pix_cobrancas
         (sessao_id, order_id, reference_id, valor_centavos, status, qr_text, qr_png_url)
       VALUES ($1, $2, $3, $4, 'WAITING', $5, $6)
       RETURNING id, order_id, valor_centavos, status, qr_text, qr_png_url, criado_em`,
      [
        sessao.id,
        order.id,
        referenceId,
        centavos,
        qr.text || null,
        pngLink ? pngLink.href : null,
      ]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      cobrancaId: ins[0].id,
      orderId: ins[0].order_id,
      valor: Number((centavos / 100).toFixed(2)),
      status: ins[0].status,
      qrText: ins[0].qr_text,
      qrPngUrl: ins[0].qr_png_url,
      mesa: mesa.numero,
      sessaoId: sessao.id,
      expiraEm: exp.toISOString(),
      gateway: 'pagbank',
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

/**
 * Webhook PagBank: quando charge.status === PAID, registra pagamento parcial.
 * Idempotente por order_id.
 */
async function processarWebhookPagBank(body) {
  const orderId = body && body.id;
  if (!orderId) {
    return { ok: false, reason: 'sem order id' };
  }

  const charges = Array.isArray(body.charges) ? body.charges : [];
  const paid = charges.find((c) => String(c.status).toUpperCase() === 'PAID');
  if (!paid) {
    return { ok: true, ignored: true, reason: 'sem charge PAID' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM pix_cobrancas WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    const cob = rows[0];
    if (!cob) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'cobrança não encontrada' };
    }
    if (cob.status === 'PAID') {
      await client.query('COMMIT');
      return { ok: true, alreadyPaid: true, cobrancaId: cob.id };
    }

    const valorReais = Number((cob.valor_centavos / 100).toFixed(2));
    const endToEnd =
      (paid.payment_method && paid.payment_method.pix && paid.payment_method.pix.end_to_end_id) ||
      null;

    await client.query(
      `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento)
       VALUES ($1, $2, 'pix')`,
      [cob.sessao_id, valorReais]
    );

    await client.query(
      `UPDATE pix_cobrancas
       SET status = 'PAID',
           pago_em = now(),
           charge_id = $2,
           end_to_end_id = $3,
           raw_webhook = $4::jsonb
       WHERE id = $1`,
      [cob.id, paid.id || null, endToEnd, JSON.stringify(body)]
    );

    // Marca aviso PIX na sessão (caixa ainda vê badge)
    await client.query(
      `UPDATE mesa_sessoes SET pix_informado_em = now() WHERE id = $1`,
      [cob.sessao_id]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      paid: true,
      cobrancaId: cob.id,
      sessaoId: cob.sessao_id,
      valor: valorReais,
      orderId,
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

async function statusCobranca(cobrancaId) {
  const { rows } = await pool.query(`SELECT * FROM pix_cobrancas WHERE id = $1`, [
    Number(cobrancaId),
  ]);
  if (!rows[0]) throw new ErroPagBank(404, 'Cobrança não encontrada');
  const c = rows[0];
  return {
    id: c.id,
    orderId: c.order_id,
    status: c.status,
    valor: Number((c.valor_centavos / 100).toFixed(2)),
    qrText: c.qr_text,
    qrPngUrl: c.qr_png_url,
    pagoEm: c.pago_em,
  };
}

module.exports = {
  tokenDisponivel,
  criarCobrancaPix,
  processarWebhookPagBank,
  statusCobranca,
  ErroPagBank,
  API_BASE,
};
