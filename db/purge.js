// Limpeza de histórico: remove sessões fechadas e pedidos ligados até uma data.
const pool = require('./pool');

class ErroPurge extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Conta o que seria apagado (dry-run) ou executa o purge.
 * Só mexe em sessões **fechadas** com fechada_em::date < before.
 * Nunca apaga sessão aberta nem pedido de mesa ativa.
 *
 * @param {{ before: string, confirm?: boolean, dryRun?: boolean }} opts
 * before = YYYY-MM-DD (exclusivo: apaga tudo com data de fechamento **antes** desse dia)
 */
async function purgeHistorico(opts = {}) {
  const before = opts.before;
  const confirm = opts.confirm === true;
  const dryRun = opts.dryRun === true || !confirm;

  if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    throw new ErroPurge('Informe before (YYYY-MM-DD)');
  }

  const client = await pool.connect();
  try {
    const { rows: counts } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM mesa_sessoes
           WHERE status = 'fechada' AND fechada_em::date < $1::date) AS sessoes,
         (SELECT COUNT(*)::int FROM pedidos p
           JOIN mesa_sessoes s ON s.id = p.sessao_id
           WHERE s.status = 'fechada' AND s.fechada_em::date < $1::date) AS pedidos,
         (SELECT COUNT(*)::int FROM itens_pedido ip
           JOIN pedidos p ON p.id = ip.pedido_id
           JOIN mesa_sessoes s ON s.id = p.sessao_id
           WHERE s.status = 'fechada' AND s.fechada_em::date < $1::date) AS itens`,
      [before]
    );
    const preview = {
      before,
      sessoes: counts[0].sessoes,
      pedidos: counts[0].pedidos,
      itens: counts[0].itens,
    };

    if (dryRun) {
      return { dryRun: true, deleted: false, ...preview };
    }

    if (preview.sessoes === 0 && preview.pedidos === 0) {
      return { dryRun: false, deleted: true, ...preview, message: 'Nada para apagar neste período.' };
    }

    await client.query('BEGIN');

    await client.query(
      `DELETE FROM itens_pedido_adicionais
       WHERE item_pedido_id IN (
         SELECT ip.id FROM itens_pedido ip
         JOIN pedidos p ON p.id = ip.pedido_id
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         WHERE s.status = 'fechada' AND s.fechada_em::date < $1::date
       )`,
      [before]
    );

    await client.query(
      `DELETE FROM itens_pedido_remocoes
       WHERE item_pedido_id IN (
         SELECT ip.id FROM itens_pedido ip
         JOIN pedidos p ON p.id = ip.pedido_id
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         WHERE s.status = 'fechada' AND s.fechada_em::date < $1::date
       )`,
      [before]
    );

    await client.query(
      `DELETE FROM itens_pedido
       WHERE pedido_id IN (
         SELECT p.id FROM pedidos p
         JOIN mesa_sessoes s ON s.id = p.sessao_id
         WHERE s.status = 'fechada' AND s.fechada_em::date < $1::date
       )`,
      [before]
    );

    await client.query(
      `DELETE FROM pedidos
       WHERE sessao_id IN (
         SELECT id FROM mesa_sessoes
         WHERE status = 'fechada' AND fechada_em::date < $1::date
       )`,
      [before]
    );

    const delSess = await client.query(
      `DELETE FROM mesa_sessoes
       WHERE status = 'fechada' AND fechada_em::date < $1::date
       RETURNING id`,
      [before]
    );

    await client.query('COMMIT');

    return {
      dryRun: false,
      deleted: true,
      before,
      sessoes: delSess.rowCount,
      pedidos: preview.pedidos,
      itens: preview.itens,
      message: `Removidas ${delSess.rowCount} sessão(ões) fechadas anteriores a ${before}.`,
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { purgeHistorico, ErroPurge };
