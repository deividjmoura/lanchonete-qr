// Rate limit simples em memória (janela deslizante por chave).
// Suficiente pra um único processo; se um dia rodar em múltiplas instâncias
// atrás de um load balancer, trocar por um contador compartilhado (Redis).
const buckets = new Map(); // chave -> timestamps[]

function golpePermitido(chave, { janelaMs, max }) {
  const agora = Date.now();
  const lista = (buckets.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) {
    buckets.set(chave, lista);
    return false;
  }
  lista.push(agora);
  buckets.set(chave, lista);
  return true;
}

// housekeeping — evita crescer pra sempre com chaves velhas (ex.: IPs que não voltam mais)
setInterval(() => {
  const agora = Date.now();
  for (const [chave, lista] of buckets) {
    const viva = lista.filter((t) => agora - t < 60 * 60 * 1000);
    if (viva.length) buckets.set(chave, viva);
    else buckets.delete(chave);
  }
}, 10 * 60 * 1000).unref();

module.exports = { golpePermitido };
