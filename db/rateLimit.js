// Rate limit em memória (janela deslizante). Não é compartilhado entre processos.
const buckets = new Map();

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

setInterval(() => {
  const agora = Date.now();
  for (const [chave, lista] of buckets) {
    const viva = lista.filter((t) => agora - t < 60 * 60 * 1000);
    if (viva.length) buckets.set(chave, viva);
    else buckets.delete(chave);
  }
}, 10 * 60 * 1000).unref();

module.exports = { golpePermitido };
