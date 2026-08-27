// Popula categorias/produtos/adicionais a partir do data/db.json atual
// (usado só uma vez, na migração do MVP em JSON para o Postgres).
// Idempotente: se já existir alguma categoria, aborta sem duplicar.
//
// Uso: node db/seed.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { garantirStaffSeed } = require('./auth');

const DB_JSON = path.join(__dirname, '..', 'data', 'db.json');

const NUM_MESAS = 12; // atual: qr/mesa-1.png ... mesa-12.png já gerados

async function run() {
  const raw = JSON.parse(fs.readFileSync(DB_JSON, 'utf8'));
  const client = await pool.connect();
  const force = process.env.FORCE_SEED === '1' || process.argv.includes('--force');

  try {
    const { rows: existentes } = await client.query('SELECT COUNT(*)::int AS n FROM categorias');
    if (existentes[0].n > 0 && !force) {
      console.log('⚠️  Já existem categorias no banco. Seed de cardápio abortado para não duplicar.');
      console.log('   Para substituir o cardápio: FORCE_SEED=1 npm run db:seed');
      const staff = await garantirStaffSeed();
      if (staff.created) {
        console.log('👤 Staff inicial criado (admin / cozinha / caixa).');
      } else {
        console.log(`👤 Staff já existe (${staff.count} usuário(s)).`);
      }
      return;
    }

    await client.query('BEGIN');

    if (force && existentes[0].n > 0) {
      await client.query('DELETE FROM itens_pedido_adicionais');
      await client.query('DELETE FROM itens_pedido_remocoes');
      await client.query('DELETE FROM itens_pedido');
      await client.query('DELETE FROM pedidos');
      await client.query('DELETE FROM mesa_sessoes');
      await client.query('DELETE FROM adicionais');
      await client.query('DELETE FROM produtos_ingredientes_removiveis');
      await client.query('DELETE FROM produtos');
      await client.query('DELETE FROM categorias');
      console.log('🗑️  Cardápio e pedidos anteriores removidos (FORCE_SEED).');
    }

    for (let numero = 1; numero <= NUM_MESAS; numero++) {
      await client.query('INSERT INTO mesas (numero) VALUES ($1) ON CONFLICT (numero) DO NOTHING', [numero]);
    }
    console.log(`✅ ${NUM_MESAS} mesas inseridas (tokens uuid gerados automaticamente).`);

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
    let totalRemoviveis = 0;

    for (const p of raw.menu) {
      const categoriaId = categoriaIdPorNome[p.category];
      const pedePontoCarne = Boolean(p.customization?.meatPoint);
      const { rows } = await client.query(
        `INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, pede_ponto_carne)
         VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id`,
        [categoriaId, p.name, p.description || null, p.price, pedePontoCarne]
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

      const removals = p.customization?.removals || [];
      for (const ingrediente of removals) {
        await client.query(
          'INSERT INTO produtos_ingredientes_removiveis (produto_id, ingrediente) VALUES ($1, $2)',
          [produtoId, ingrediente]
        );
        totalRemoviveis++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ ${totalProdutos} produtos, ${totalAdicionais} adicionais e ${totalRemoviveis} ingredientes removíveis inseridos.`);

    const staff = await garantirStaffSeed();
    if (staff.created) {
      console.log('👤 Staff inicial criado (admin / cozinha / caixa).');
    }
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
