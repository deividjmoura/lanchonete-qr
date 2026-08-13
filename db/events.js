// Barramento simples de Server-Sent Events (SSE).
// Clientes conectam em GET /api/events e recebem pings quando há mudança
// operacional (pedido criado, status avançado, sessão fechada).

const clients = new Set();

function subscribe(res) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

function broadcast(event, payload = {}) {
  if (!clients.size) return;
  const data = JSON.stringify({ ...payload, at: Date.now() });
  const chunk = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of clients) {
    try {
      res.write(chunk);
    } catch (_) {
      clients.delete(res);
    }
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { subscribe, broadcast, clientCount };
