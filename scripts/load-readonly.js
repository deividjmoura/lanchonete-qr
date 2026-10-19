#!/usr/bin/env node
/**
 * Ensaio de carga SOMENTE LEITURA: 70 clientes consultando o cardápio.
 * Não simula sessões/pedidos nem substitui um teste de ponta a ponta.
 * BASE_URL=http://localhost:3000 CONCURRENCY=70 REQUESTS=700 npm run test:load:read
 */
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const concurrency = Math.max(1, Math.min(200, Number(process.env.CONCURRENCY) || 70));
const total = Math.max(concurrency, Math.min(10000, Number(process.env.REQUESTS) || 700));
const timeout = Math.max(1000, Number(process.env.TIMEOUT_MS) || 10000);
let next = 0, failed = 0;
const samples = [];
const errors = {};
async function worker() {
  while (next < total) {
    next++;
    const start = performance.now();
    try {
      const res = await fetch(new URL('/api/cardapio', base), {
        signal: AbortSignal.timeout(timeout),
        headers: { 'Cache-Control': 'no-cache' },
      });
      const payload = await res.text();
      if (!res.ok || !payload) throw Error('HTTP ' + res.status + (payload ? '' : ' empty'));
    } catch (err) {
      failed++;
      const key = String(err.message || err.name);
      errors[key] = (errors[key] || 0) + 1;
    } finally {
      samples.push(performance.now() - start);
    }
  }
}
(async () => {
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const secs = (performance.now() - t0) / 1000;
  samples.sort((a,b) => a-b);
  const at = p => Math.round(samples[Math.min(samples.length-1, Math.ceil(samples.length*p)-1)]);
  console.log(JSON.stringify({
    endpoint: new URL('/api/cardapio', base).toString(), concurrency,
    requests: total, failed, errorRate: Number((failed / total * 100).toFixed(2)),
    p50ms: at(.5), p95ms: at(.95), p99ms: at(.99),
    throughputRps: Number((total / secs).toFixed(1)), errors
  }, null, 2));
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
