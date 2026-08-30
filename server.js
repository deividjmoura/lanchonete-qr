require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const { getCardapio, invalidarCardapio } = require('./db/cardapio');
const {
  criarPedido,
  avancarStatus,
  getSessao,
  getFilaCozinha,
  getFilaGarcom,
  checkinCliente,
  ErroPedido,
} = require('./db/pedidos');
const { informarPixPago, ErroPixCliente } = require('./db/pix-cliente');
const {
  ErroAdmin,
  listMesas,
  getCardapioAdmin,
  criarCategoria,
  atualizarCategoria,
  criarProduto,
  atualizarProduto,
  criarAdicional,
  removerAdicional,
  setRemoviveis,
} = require('./db/admin');
const {
  listSessoesAbertas,
  fecharSessao,
  ErroCaixa,
} = require('./db/caixa');
const {
  SESSION_COOKIE,
  ErroAuth,
  parseCookies,
  cookieDeSessao,
  cookieDeLogout,
  autenticar,
  criarSessao,
  destruirSessao,
  getStaffDaRequisicao,
  exigirAcesso,
  homeDoPapel,
  garantirStaffSeed,
} = require('./db/auth');
const { golpePermitido } = require('./db/rateLimit');
const { subscribe, broadcast } = require('./db/events');
const {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  entregarComoGarcom,
  listPedidosRecentes,
} = require('./db/garcons');
const { resumoDia } = require('./db/dashboard');
const { relatorioVendas } = require('./db/relatorio');
const { purgeHistorico, ErroPurge } = require('./db/purge');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 128 * 1024);

function clientIp(req) {
  if (process.env.NODE_ENV === 'production') {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) {
      return xff.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
  }
}

function send(res, status, type, body) {
  applySecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error('Payload too large');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const s = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(s || '{}'));
      } catch (e) {
        const err = new Error('JSON inválido');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;

    if (p === '/api/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapio());
    }

    let m;
    if (p === '/api/events' && req.method === 'GET') {
      applySecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (req.socket && typeof req.socket.setTimeout === 'function') {
        req.socket.setTimeout(0);
      }
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, at: Date.now() })}\n\n`);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      subscribe(res);
      const hb = setInterval(() => {
        try {
          res.write(`: ping ${Date.now()}\n\n`);
        } catch (_) {
          clearInterval(hb);
        }
      }, 15000);
      req.on('close', () => {
        clearInterval(hb);
      });
      return;
    }

    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos$/)) && req.method === 'POST') {
      const ip = clientIp(req);
      if (!golpePermitido(`pedido:${ip}:${m[1]}`, { janelaMs: 5 * 60 * 1000, max: 10 })) {
        return json(res, 429, { error: 'Muitos pedidos em pouco tempo. Aguarde um instante.' });
      }
      try {
        const pedido = await criarPedido(m[1], await body(req));
        broadcast('update', { type: 'pedido_criado', pedidoId: pedido.id, mesaToken: m[1] });
        return json(res, 201, pedido);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/checkin$/)) && req.method === 'POST') {
      try {
        const out = await checkinCliente(m[1], await body(req));
        broadcast('update', { type: 'checkin', mesaToken: m[1], clienteNome: out.clienteNome });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/sessao$/)) && req.method === 'GET') {
      try {
        return json(res, 200, await getSessao(m[1]));
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pix-informado$/)) && req.method === 'POST') {
      try {
        const out = await informarPixPago(m[1]);
        broadcast('update', { type: 'pix_informado', mesaToken: m[1], sessaoId: out.sessaoId });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPixCliente) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/garcom/pedidos' && req.method === 'GET') {
      return json(res, 401, { error: 'Use /api/garcom/:token/pedidos com o link do garçom' });
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/me$/)) && req.method === 'GET') {
      const g = await getGarcomPorToken(m[1]);
      if (!g || !g.ativo) return json(res, 401, { error: 'Link inválido ou desativado' });
      return json(res, 200, { id: g.id, nome: g.nome });
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos$/)) && req.method === 'GET') {
      const g = await getGarcomPorToken(m[1]);
      if (!g || !g.ativo) return json(res, 401, { error: 'Link inválido ou desativado' });
      return json(res, 200, await getFilaGarcom());
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/entregar$/)) && req.method === 'POST') {
      try {
        const out = await entregarComoGarcom(Number(m[2]), m[1]);
        broadcast('update', {
          type: 'status_alterado',
          pedidoId: Number(m[2]),
          status: 'entregue',
          garcom: out.garcom?.nome,
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom<|control29|>response<|control30|>Push failed mid-server - need to complete. Let me push server with create_or_update using artifacts file and caixa.html separately with a shorter approach.
