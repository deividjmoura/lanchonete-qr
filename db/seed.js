// Popula categorias/produtos/adicionais a partir do data/db.json atual
// (usado só uma vez, na migração do MVP em JSON para o Postgres).
// Idempotente: se já existir alguma categoria, aborta sem duplicar.
//
// Uso: node db/seed.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const DB_JSON = path.join(__dirname, '..', 'data', 'db.json');

const NUM_MESAS = 12; // atual: qr/mesa-1.png ... mesa-12.png já gerados

async function run() {
  const raw = JSON.parse(fs.readFileSync(DB_JSON, 'utf8'));
  const client = await pool.connect();

  try {
    const { rows: existentes } = await client.query('SELECT COUNT(*)::int AS n FROM categorias');
    if (existentes[0].n > 0) {
      console.log('⚠️  Já existem categorias no banco. Seed abortado para não duplicar.');
      return;
    }

    await client.query('BEGIN');

    // Mesas — o token novo (uuid) substitui o número puro na URL do QR.
    // Os QR codes em qr/*.png precisam ser regenerados apontando pro token,
    // não pro número (ver seção 7 do plano: "Segurança básica").
    for (let numero = 1; numero <= NUM_MESAS; numero++) {
      await client.query('INSERT INTO mesas (numero) VALUES ($1) ON CONFLICT (numero) DO NOTHING', [numero]);
    }
    console.log(`✅ ${NUM_MESAS} mesas inseridas (tokens uuid gerados automaticamente).`);

    // Ordem das categorias = ordem de primeira aparição no db.json
    const categoriasNomes = [...new Set(raw.menu.map((p) => p.category))];
    const categoriaIdPorNome = {};

    for (let i = 0; i < categoriasNomes.length; i++) {
      const nome = categoriasNomes[i];
      const { rows } = await client.query(
        'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id',
        [nome, i]
      );
      categoriaIdPorNome[nome] = rows[0].id;
    }
    console.log(`✅ ${categoriasNomes.length} categorias inseridas.`);

    let totalProdutos = 0;
    let totalAdicionais = 0;

    for (const p of raw.menu) {
      const categoriaId = categoriaIdPorNome[p.category];
      const { rows } = await client.query(
        `INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
        [categoriaId, p.name, p.description || null, p.price]
      );
      const produtoId = rows[0].id;
      totalProdutos++;

      const additions = p.customization?.additions || [];
      for (const a of additions) {
        await client.query(
          'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1, $2, $3)',
          [produtoId, a.name, a.price]
        );
        totalAdicionais++;
      }

      // Observação: `removals` e `meatPoint` do customization são regras de
      // exibição (quais remoções/ponto da carne o produto aceita), não dados
      // transacionais — no schema novo isso fica hardcoded no backend/admin
      // por enquanto (ver seção 8, passo 2 do plano para migrar o admin).
    }

    await client.query('COMMIT');
    console.log(`✅ ${totalProdutos} produtos e ${totalAdicionais} adicionais inseridos.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
