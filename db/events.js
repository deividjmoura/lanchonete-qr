// Barramento SSE: clientes em GET /api/events recebem eventos operacionais.
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
