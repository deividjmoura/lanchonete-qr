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
  senhaConfigurada,
  senhaValida,
  criarSessao,
  destruirSessao,
  estaAutenticado,
  parseCookies,
  cookieDeSessao,
  cookieDeLogout,
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

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 128 * 1024);

/** IP do cliente; em produção usa o primeiro hop de X-Forwarded-For. */
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
  // CSP: 'unsafe-inline' necessário enquanto scripts/estilos estão embutidos no HTML.
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob:",
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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      subscribe(res);
      const hb = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch (_) {
          clearInterval(hb);
        }
      }, 25000);
      req.on('close', () => clearInterval(hb));
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
    // Fila do garçom só via token: /api/garcom/:token/pedidos
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
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if (p === '/api/login' && req.method === 'POST') {
      if (!senhaConfigurada()) {
        return json(res, 500, { error: 'ADMIN_PASSWORD não configurada no servidor' });
      }
      const ip = clientIp(req);
      if (!golpePermitido(`login:${ip}`, { janelaMs: 5 * 60 * 1000, max: 8 })) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const b = await body(req);
      if (!senhaValida(b.senha)) return json(res, 401, { error: 'Senha incorreta' });
      res.setHeader('Set-Cookie', cookieDeSessao(criarSessao()));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      destruirSessao(parseCookies(req)[SESSION_COOKIE]);
      res.setHeader('Set-Cookie', cookieDeLogout());
      return json(res, 200, { ok: true });
    }

    if ((p.startsWith('/api/admin') || p.startsWith('/api/caixa') || p.startsWith('/api/cozinha') || (p.match(/^\/api\/pedidos\/\d+\/status$/) && req.method === 'PATCH')) && !estaAutenticado(req)) {
      return json(res, 401, { error: 'Não autenticado' });
    }

    if (p === '/api/cozinha/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaCozinha());
    }

    if (p === '/api/caixa/sessoes' && req.method === 'GET') {
      return json(res, 200, await listSessoesAbertas());
    }
    if ((m = p.match(/^\/api\/caixa\/sessoes\/(\d+)\/fechar$/)) && req.method === 'POST') {
      try {
        const out = await fecharSessao(Number(m[1]), await body(req));
        broadcast('update', { type: 'sessao_fechada', sessaoId: Number(m[1]) });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroCaixa) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/pedidos\/(\d+)\/status$/)) && req.method === 'PATCH') {
      try {
        const b = await body(req);
        const out = await avancarStatus(Number(m[1]), b.status);
        broadcast('update', { type: 'status_alterado', pedidoId: Number(m[1]), status: b.status });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if (p === '/api/admin/mesas' && req.method === 'GET') {
      return json(res, 200, await listMesas());
    }
    if (p === '/api/admin/garcons' && req.method === 'GET') {
      return json(res, 200, await listGarcons());
    }
    if (p === '/api/admin/garcons' && req.method === 'POST') {
      try {
        return json(res, 201, await criarGarcom(await body(req)));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const b = await body(req);
        return json(res, 200, await setGarcomAtivo(Number(m[1]), b.ativo !== false));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        return json(res, 200, await removerGarcom(Number(m[1])));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/pedidos' && req.method === 'GET') {
      return json(res, 200, await listPedidosRecentes({ limit: 80 }));
    }
    if (p === '/api/admin/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapioAdmin());
    }
    if (p === '/api/admin/categorias' && req.method === 'POST') {
      try {
        const out = await criarCategoria(await body(req));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/categorias\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const out = await atualizarCategoria(Number(m[1]), await body(req));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/produtos' && req.method === 'POST') {
      try {
        const out = await criarProduto(await body(req));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const out = await atualizarProduto(Number(m[1]), await body(req));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/adicionais$/)) && req.method === 'POST') {
      try {
        const out = await criarAdicional(Number(m[1]), await body(req));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/adicionais\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await removerAdicional(Number(m[1]));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/removiveis$/)) && req.method === 'PUT') {
      try {
        const b = await body(req);
        const out = await setRemoviveis(Number(m[1]), b.ingredientes || b.removiveis || []);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if ((p === '/admin' || p === '/caixa' || p === '/cozinha') && !estaAutenticado(req)) {
      res.writeHead(302, { Location: `/login?next=${encodeURIComponent(p)}` });
      return res.end();
    }
    if (p === '/') {
      res.writeHead(302, { Location: '/admin' });
      return res.end();
    }
    let file = p;
    if (file.startsWith('/mesa/')) file = '/mesa.html';
    if (file.startsWith('/pedido/')) file = '/pedido.html';
    if (file === '/cozinha') file = '/cozinha.html';
    if (file === '/garcom' || /^\/garcom\/[0-9a-f-]{36}$/i.test(file)) file = '/garcom.html';
    if (file === '/caixa') file = '/caixa.html';
    if (file === '/admin') file = '/admin.html';
    if (file === '/login') file = '/login.html';
    const publicRoot = path.resolve(ROOT, 'public');
    const fp = path.resolve(publicRoot, '.' + (file.startsWith('/') ? file : '/' + file));
    if (!fp.startsWith(publicRoot + path.sep) && fp !== publicRoot) {
      return send(res, 400, 'text/plain', 'Bad path');
    }
    try {
      const data = await fs.promises.readFile(fp);
      return send(res, 200, mime[path.extname(fp)] || 'application/octet-stream', data);
    } catch {
      return send(res, 404, 'text/plain', '404');
    }
  } catch (e) {
    console.error(e);
    if (e && e.status) {
      return json(res, e.status, { error: e.message || 'Erro' });
    }
    const msg =
      process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor'
        : (e && e.message) || 'Erro interno';
    json(res, 500, { error: msg });
  }
});

server.listen(PORT, () => console.log(`🍔 Lanchonete QR V2: http://localhost:${PORT}`));
