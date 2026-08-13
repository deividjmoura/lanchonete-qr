const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida. Copie .env.example para .env e ajuste.');
  process.exit(1);
}

const useSsl = process.env.DATABASE_SSL === 'true';
// Em produção preferimos validar o certificado. Para provedores com CA
// própria, defina DATABASE_SSL_REJECT_UNAUTHORIZED=false explicitamente.
const rejectUnauthorized =
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' &&
  process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

module.exports = pool;
