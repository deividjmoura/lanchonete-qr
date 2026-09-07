/** Liga estoque em produtos de categorias de bebida (DB já populado). */
require('dotenv').config();
const pool = require('./pool');

async function main() {
  const { rowCount } = await pool.query(`
    UPDATE produtos p
       SET controla_estoque = TRUE,
           estoque = COALESCE(p.estoque, 36),
           estoque_minimo = GREATEST(COALESCE(p.estoque_minimo, 0), 6)
      FROM categorias c
     WHERE p.categoria_id = c.id
       AND (
         c.nome ILIKE '%bebida%'
         OR c.nome ILIKE '%long neck%'
         OR c.nome ILIKE '%cerveja%'
         OR c.nome ILIKE '%dose%'
         OR c.nome ILIKE '%caipi%'
         OR c.nome ILIKE '%drink%'
         OR c.nome ILIKE '%refriger%'
       )
  `);
  console.log(`Estoque atualizado em ${rowCount} produtos de bebida.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
