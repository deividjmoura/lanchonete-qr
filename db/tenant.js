// Helpers de tenant (schema + isolamento + path /loja/{slug}).
const pool = require('./pool');

let cachedPadraoId = null;

/** ID do estabelecimento slug=padrao (cache em processo). */
async function getEstabelecimentoPadraoId() {
  if (cachedPadraoId != null) return cachedPadraoId;
  const { rows } = await pool.query(
    `SELECT id FROM estabelecimentos WHERE slug = 'padrao' LIMIT 1`
  );
  if (!rows[0]) {
    throw new Error('estabelecimento padrao não encontrado — rode npm run db:migrate');
  }
  cachedPadraoId = rows[0].id;
  return cachedPadraoId;
}

/**
 * Resolve o tenant a usar nas queries.
 * Aceita: number | string numérica | staff com estabelecimentoId | null → padrao.
 */
async function resolveEstabelecimentoId(explicit) {
  if (explicit != null && typeof explicit === 'object' && explicit.estabelecimentoId != null) {
    return Number(explicit.estabelecimentoId);
  }
  if (explicit != null && explicit !== '') {
    const n = Number(explicit);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return getEstabelecimentoPadraoId();
}

async function getEstabelecimentoPorSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  const { rows } = await pool.query(
    `SELECT id, nome, slug, logo_url, tema, ativo
     FROM estabelecimentos WHERE slug = $1 LIMIT 1`,
    [s]
  );
  return rows[0] || null;
}

/** Mesa + dados do estabelecimento (por token UUID). */
async function getMesaPorTokenComTenant(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const { rows } = await pool.query(
    `SELECT m.id, m.numero, m.status, m.token, m.estabelecimento_id,
            e.slug, e.nome AS estabelecimento_nome, e.ativo AS estabelecimento_ativo
     FROM mesas m
     JOIN estabelecimentos e ON e.id = m.estabelecimento_id
     WHERE m.token = $1
     LIMIT 1`,
    [t]
  );
  return rows[0] || null;
}

/**
 * Garante que a mesa existe, a loja está ativa e (se slug informado) bate com a URL.
 * @returns {object} row da mesa
 * @throws {{ status: number, message: string }}
 */
async function assertMesaAcesso(token, slugOptional) {
  const mesa = await getMesaPorTokenComTenant(token);
  if (!mesa) {
    const err = new Error('Mesa não encontrada');
    err.status = 404;
    throw err;
  }
  if (!mesa.estabelecimento_ativo) {
    const err = new Error('Estabelecimento inativo');
    err.status = 403;
    throw err;
  }
  if (slugOptional) {
    const s = String(slugOptional).trim().toLowerCase();
    if (s && mesa.slug !== s) {
      const err = new Error('Mesa não pertence a este estabelecimento');
      err.status = 403;
      throw err;
    }
  }
  return mesa;
}

function clearTenantCache() {
  cachedPadraoId = null;
}

/**
 * Mapa de tabelas que assertPertenceAoTenant sabe validar.
 * `join` é opcional (só necessário quando a tabela não tem estabelecimento_id
 * direto); `eidCol` deve vir qualificado com o nome da tabela/alias certo.
 */
const TENANT_TABELAS = {
  categorias: {
    pk: 'id',
    eidCol: 'categorias.estabelecimento_id',
  },
  produtos: {
    pk: 'id',
    join: 'JOIN categorias ON categorias.id = produtos.categoria_id',
    eidCol: 'categorias.estabelecimento_id',
  },
  adicionais: {
    pk: 'id',
    join:
      'JOIN produtos ON produtos.id = adicionais.produto_id ' +
      'JOIN categorias ON categorias.id = produtos.categoria_id',
    eidCol: 'categorias.estabelecimento_id',
  },
  garcons: {
    pk: 'id',
    eidCol: 'garcons.estabelecimento_id',
  },
  mesa_sessoes: {
    pk: 'id',
    join: 'JOIN mesas ON mesas.id = mesa_sessoes.mesa_id',
    eidCol: 'mesas.estabelecimento_id',
  },
  pedidos: {
    pk: 'id',
    join:
      'JOIN mesa_sessoes ON mesa_sessoes.id = pedidos.sessao_id ' +
      'JOIN mesas ON mesas.id = mesa_sessoes.mesa_id',
    eidCol: 'mesas.estabelecimento_id',
  },
};

class ErroTenant extends Error {
  constructor(message = 'Recurso não encontrado') {
    super(message);
    // 404, não 403: não queremos confirmar pra fora do tenant que o
    // registro existe em outra loja.
    this.status = 404;
  }
}

/**
 * Garante que o registro `id` da `tabela` pertence a `estabelecimentoId`.
 * Lança ErroTenant (404) se não pertencer ou não existir.
 *
 * `executor` é o pool ou um client de transação (pra poder chamar dentro
 * de um BEGIN/COMMIT já aberto, com FOR UPDATE nas queries seguintes).
 *
 * Chamar isso no topo de todo handler de escrita que recebe um ID é o que
 * evita o problema de "esquecer de nesse endpoint" — a validação fica
 * centralizada aqui em vez de reimplementada (ou esquecida) em cada função.
 */
async function assertPertenceAoTenant(executor, tabela, id, estabelecimentoId) {
  if (!estabelecimentoId) {
    throw new Error(
      `assertPertenceAoTenant: estabelecimentoId ausente (tabela "${tabela}")`
    );
  }
  const cfg = TENANT_TABELAS[tabela];
  if (!cfg) {
    throw new Error(`assertPertenceAoTenant: tabela "${tabela}" não mapeada`);
  }
  const { rows } = await executor.query(
    `SELECT 1 FROM ${tabela} ${cfg.join || ''}
     WHERE ${tabela}.${cfg.pk} = $1 AND ${cfg.eidCol} = $2`,
    [id, estabelecimentoId]
  );
  if (!rows[0]) throw new ErroTenant();
}

module.exports = {
  getEstabelecimentoPadraoId,
  resolveEstabelecimentoId,
  getEstabelecimentoPorSlug,
  getMesaPorTokenComTenant,
  assertMesaAcesso,
  clearTenantCache,
  assertPertenceAoTenant,
  ErroTenant,
};
