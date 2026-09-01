const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida. Copie .env.example para .env e ajuste.');
  process.exit(1);
}

/**
 * Neon / Render costumam entregar DATABASE_URL com ?sslmode=require.
 * O driver `pg` (pg-connection-string ≥ 2.10) emite um SECURITY WARNING porque
 * hoje trata require/prefer/verify-ca como verify-full, e isso mudará no pg v9.
 *
 * Solução: normalizar para sslmode=verify-full (mesmo comportamento atual,
 * sem o warning) e ainda permitir override via DATABASE_SSL_* quando necessário.
 */
function normalizeConnectionString(url) {
  try {
    const u = new URL(url);
    const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    if (mode === 'require' || mode === 'prefer' || mode === 'verify-ca') {
      u.searchParams.set('sslmode', 'verify-full');
    }
    return u.toString();
  } catch {
    // URL malformada — devolve original e deixa o pg reclamar
    return url;
  }
}

const connectionString = normalizeConnectionString(process.env.DATABASE_URL);

// Controle explícito de SSL (útil quando a string não traz sslmode)
const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  /[?&]sslmode=/i.test(process.env.DATABASE_URL || '');

// Em produção validamos o certificado. Só desligue se o provedor exigir
// (ex.: DATABASE_SSL_REJECT_UNAUTHORIZED=false).
const rejectUnauthorized =
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

const pool = new Pool({
  connectionString,
  // Quando a string já tem sslmode=verify-full, o parser do pg monta ssl sozinho.
  // Passamos ssl só se precisarmos forçar rejectUnauthorized=false.
  ...(useSsl && process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false'
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message || err);
});

module.exports = pool;
