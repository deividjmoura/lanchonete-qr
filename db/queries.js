// Helpers compartilhados entre as rotas que já foram migradas pro Postgres.
// Nada aqui grava dado transacional sozinho — quem faz isso é db/pedidos.js,
// dentro de transações. Este módulo só lê e resolve a sessão da mesa.

const TRANSICOES = {
  recebido: 'em_producao',
  em_producao: 'concluido',
  concluido: 'entregue',
};

async function getMesaPorToken(client, token) {
  const { rows } = await client.query(
    'SELECT id, numero, status FROM mesas WHERE token = $1',
    [token]
  );
  return rows[0] || null;
}

// Retorna o id da sessão aberta da mesa, criando uma se não existir.
// uq_mesa_sessao_aberta (migration 0001) garante no banco que só existe uma
// sessão aberta por mesa; se duas requisições chegarem juntas, a segunda
// esbarra na constraint (23505) e reaproveita a sessão que a primeira abriu
// — não precisa de lock manual.
async function getOuAbrirSessao(client, mesaId) {
  const { rows: abertas } = await client.query(
    "SELECT id FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'",
    [mesaId]
  );
  if (abertas[0]) return abertas[0].id;

  try {
    const { rows: novas } = await client.query(
      'INSERT INTO mesa_sessoes (mesa_id) VALUES ($1) RETURNING id',
      [mesaId]
    );
    await client.query("UPDATE mesas SET status = 'ocupada' WHERE id = $1", [mesaId]);
    return novas[0].id;
  } catch (err) {
    if (err.code === '23505') {
      const { rows: existentes } = await client.query(
        "SELECT id FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'",
        [mesaId]
      );
      if (existentes[0]) return existentes[0].id;
    }
    throw err;
  }
}

// Lê o produto junto com as regras que o servidor precisa pra validar o item
// do pedido (nunca confiar em preço/adicional/remoção vindos do cliente).
async function getProdutoComRegras(client, produtoId) {
  const { rows } = await client.query(
    'SELECT id, nome, preco, disponivel, pede_ponto_carne, controla_estoque, estoque FROM produtos WHERE id = $1',
    [produtoId]
  );
  if (!rows[0]) return null;

  const { rows: adicionais } = await client.query(
    'SELECT id, nome, preco FROM adicionais WHERE produto_id = $1',
    [produtoId]
  );
  const { rows: removiveis } = await client.query(
    'SELECT ingrediente FROM produtos_ingredientes_removiveis WHERE produto_id = $1',
    [produtoId]
  );

  return {
    ...rows[0],
    adicionaisPermitidos: adicionais,
    removiveisPermitidos: removiveis.map((r) => r.ingrediente),
  };
}

module.exports = { TRANSICOES, getMesaPorToken, getOuAbrirSessao, getProdutoComRegras };
